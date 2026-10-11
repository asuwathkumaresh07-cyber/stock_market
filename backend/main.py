"""
main.py
-------
FastAPI backend exposing the stock recommendation engine and interactive chart API.

Run locally:
    uvicorn main:app --reload --port 8000
"""

from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from predictor import (
        get_recommendation,
        get_news_sentiment,
        get_stock_history,
        get_market_indices,
        predict_all_parallel,
    )
    from stocks import STOCKS, INDICES, get_display_name
except ImportError:
    from backend.predictor import (
        get_recommendation,
        get_news_sentiment,
        get_stock_history,
        get_market_indices,
        predict_all_parallel,
    )
    from backend.stocks import STOCKS, INDICES, get_display_name

app = FastAPI(
    title="India Stock Market & Recommendation API",
    description="Interactive Financial Graph + XGBoost Technical Analysis + News Sentiment",
    version="2.0.0",
)

# Allow CORS for development and cross-origin calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


class PortfolioRequest(BaseModel):
    symbols: list[str]


@app.get("/api/health")
def api_health_check():
    return {
        "status": "ok",
        "message": "Indian Stock Market & Predictor API is operational",
        "version": "2.0.0",
    }


@app.get("/api/indices")
def market_indices():
    """Returns live snapshot and mini-sparklines for pure NSE indices: NIFTY 50, BANK NIFTY, NIFTY IT, NIFTY 100."""
    try:
        return {"indices": get_market_indices()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch market indices: {e}")


@app.get("/api/history/{stock_symbol}")
def stock_history(
    stock_symbol: str,
    period: str = Query("1y", description="Time period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max"),
    interval: Optional[str] = Query(None, description="Bar interval: 5m, 15m, 1h, 1d, 1wk, 1mo"),
):
    """
    Returns full OHLCV candlestick data, Volume, SMA20, SMA50, Bollinger Bands,
    RSI, MACD, and AI Forecast projections for the interactive chart.
    """
    try:
        data = get_stock_history(stock_symbol, period=period, interval=interval)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching chart history: {e}")


@app.get("/predict/{stock_symbol}")
@app.get("/api/predict/{stock_symbol}")
def predict(stock_symbol: str):
    """
    Returns technical (XGBoost) + sentiment based recommendation
    for a single stock. Example: GET /api/predict/RELIANCE.NS
    """
    try:
        result = get_recommendation(stock_symbol.upper())
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


@app.get("/api/stocks")
def list_stocks():
    """Returns tracked NSE symbols and indices."""
    stocks_list = [{"symbol": s, "name": n, "type": "stock"} for s, n in STOCKS.items()]
    indices_list = [{"symbol": s, "name": n, "type": "index"} for s, n in INDICES.items()]
    return {"stocks": stocks_list, "indices": indices_list}


@app.get("/api/news/{stock_symbol}")
def news(stock_symbol: str):
    """Per-headline sentiment, used by the dashboard's news modal."""
    symbol = stock_symbol.upper()
    try:
        sentiment = get_news_sentiment(symbol)
        return {
            "symbol": symbol,
            "company": get_display_name(symbol),
            "sentiment_score": sentiment.get("sentiment_score", 0.5),
            "label": sentiment.get("label", "Neutral"),
            "articles": sentiment.get("headlines", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"News lookup failed: {e}")


@app.get("/api/predict-all")
def predict_all():
    """Runs recommendation across all tracked NSE stocks concurrently."""
    try:
        return predict_all_parallel(max_workers=8)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk prediction failed: {e}")


@app.post("/portfolio")
@app.post("/api/portfolio")
def portfolio(request: PortfolioRequest):
    """
    Portfolio analyzer.
    Body: {"symbols": ["RELIANCE.NS", "TCS.NS", "INFY.NS"]}
    """
    results = []
    for symbol in request.symbols:
        try:
            results.append(get_recommendation(symbol.upper()))
        except Exception as e:
            results.append({"stock": symbol.upper(), "error": str(e)})
    return {"portfolio": results}


# Mount frontend static files so visiting http://localhost:8000 also serves the dashboard directly
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    @app.get("/")
    def health_check():
        return {"status": "ok", "message": "Stock Recommendation API is running"}

