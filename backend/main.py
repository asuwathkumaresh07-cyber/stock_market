"""
main.py
-------
FastAPI backend exposing the stock recommendation engine.

Run locally:
    uvicorn main:app --reload --port 8000

Endpoints:
    GET  /                          -> health check
    GET  /predict/{stock_symbol}    -> BUY/HOLD/SELL for one stock
    POST /portfolio                 -> BUY/HOLD/SELL for a list of stocks
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from predictor import get_recommendation, get_news_sentiment
from stocks import STOCKS

app = FastAPI(
    title="Stock Recommendation API",
    description="XGBoost technical analysis + FinBERT sentiment -> BUY/HOLD/SELL",
    version="1.0.0",
)

# Allow the React frontend (any origin during development) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PortfolioRequest(BaseModel):
    symbols: list[str]


@app.get("/")
def health_check():
    return {"status": "ok", "message": "Stock Recommendation API is running"}


@app.get("/api/health")
def api_health_check():
    return {"status": "ok", "message": "Stock Recommendation API is running"}


@app.get("/predict/{stock_symbol}")
@app.get("/api/predict/{stock_symbol}")
def predict(stock_symbol: str):
    """
    Returns technical (XGBoost) + sentiment (FinBERT) based recommendation
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
    return {"stocks": [{"symbol": s, "name": n} for s, n in STOCKS.items()]}


@app.get("/api/news/{stock_symbol}")
def news(stock_symbol: str):
    """Per-headline FinBERT sentiment, used by the dashboard's news modal."""
    symbol = stock_symbol.upper()
    try:
        sentiment = get_news_sentiment(symbol)
        return {
            "symbol": symbol,
            "company": STOCKS.get(symbol, symbol),
            "articles": sentiment.get("headlines", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"News lookup failed: {e}")


@app.get("/api/predict-all")
def predict_all():
    """Runs the full XGBoost + FinBERT recommendation across every tracked stock."""
    results, errors = [], []
    for symbol in STOCKS:
        try:
            results.append(get_recommendation(symbol))
        except Exception as e:
            errors.append({"symbol": symbol, "error": str(e)})
    return {"results": results, "errors": errors}


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
