"""
India Stock Trend Predictor — backend
--------------------------------------
Combines live NSE price momentum (via yfinance) with financial-news
sentiment (via NewsAPI + VADER) into a simple, transparent UP/DOWN/NEUTRAL
signal per stock.

This is a heuristic signal for educational purposes — NOT financial advice.
"""

import os
import time
from datetime import datetime, timezone

import requests
import yfinance as yf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from dotenv import load_dotenv

from stocks import STOCKS

load_dotenv()

NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "")
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "300"))

app = FastAPI(title="India Stock Trend Predictor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

analyzer = SentimentIntensityAnalyzer()
_cache: dict = {}


def cache_get(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < CACHE_TTL_SECONDS:
        return entry["data"]
    return None


def cache_set(key: str, data):
    _cache[key] = {"data": data, "ts": time.time()}


def compute_rsi(closes, period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    deltas = closes.diff().dropna()
    gains = deltas.clip(lower=0)
    losses = -deltas.clip(upper=0)
    avg_gain = gains.rolling(period).mean().iloc[-1]
    avg_loss = losses.rolling(period).mean().iloc[-1]
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def get_momentum(symbol: str) -> dict:
    hist = yf.Ticker(symbol).history(period="3mo")
    if hist.empty or len(hist) < 21:
        raise HTTPException(status_code=404, detail=f"No price history for {symbol}")

    closes = hist["Close"]
    last_price = float(closes.iloc[-1])
    prev_price = float(closes.iloc[-2])
    day_change_pct = (last_price - prev_price) / prev_price * 100

    five_day_pct = (last_price - float(closes.iloc[-6])) / float(closes.iloc[-6]) * 100
    sma20 = float(closes.rolling(20).mean().iloc[-1])
    sma_gap_pct = (last_price - sma20) / sma20 * 100
    rsi = compute_rsi(closes)

    # Normalize each raw signal to roughly the -1..1 range
    five_day_score = max(-1.0, min(1.0, five_day_pct / 8))
    sma_score = max(-1.0, min(1.0, sma_gap_pct / 6))
    rsi_score = max(-1.0, min(1.0, (rsi - 50) / 30))

    momentum_score = 0.45 * five_day_score + 0.30 * sma_score + 0.25 * rsi_score

    return {
        "price": round(last_price, 2),
        "day_change_pct": round(day_change_pct, 2),
        "five_day_pct": round(five_day_pct, 2),
        "rsi": round(rsi, 1),
        "momentum_score": round(momentum_score, 3),
    }


def fetch_news(company_name: str, limit: int = 6) -> list:
    if not NEWSAPI_KEY:
        return []
    try:
        resp = requests.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": f'"{company_name}"',
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": limit,
                "apiKey": NEWSAPI_KEY,
            },
            timeout=8,
        )
        resp.raise_for_status()
        articles = resp.json().get("articles", [])
    except requests.RequestException:
        return []

    items = []
    for a in articles:
        title = (a.get("title") or "").strip()
        if not title:
            continue
        vs = analyzer.polarity_scores(title)
        items.append(
            {
                "title": title,
                "source": (a.get("source") or {}).get("name", ""),
                "url": a.get("url"),
                "published_at": a.get("publishedAt"),
                "sentiment": round(vs["compound"], 3),
            }
        )
    return items


def average_sentiment(news_items: list) -> float:
    if not news_items:
        return 0.0
    return round(sum(n["sentiment"] for n in news_items) / len(news_items), 3)


@app.get("/api/stocks")
def list_stocks():
    return {"stocks": [{"symbol": s, "name": n} for s, n in STOCKS.items()]}


@app.get("/api/quote/{symbol}")
def quote(symbol: str):
    key = f"quote:{symbol}"
    cached = cache_get(key)
    if cached:
        return cached
    data = get_momentum(symbol)
    cache_set(key, data)
    return data


@app.get("/api/news/{symbol}")
def news(symbol: str):
    company = STOCKS.get(symbol)
    if not company:
        raise HTTPException(status_code=404, detail="Unknown symbol")
    key = f"news:{symbol}"
    cached = cache_get(key)
    if cached:
        return cached
    items = fetch_news(company)
    data = {"symbol": symbol, "company": company, "articles": items}
    cache_set(key, data)
    return data


@app.get("/api/predict/{symbol}")
def predict(symbol: str):
    company = STOCKS.get(symbol)
    if not company:
        raise HTTPException(status_code=404, detail="Unknown symbol")

    key = f"predict:{symbol}"
    cached = cache_get(key)
    if cached:
        return cached

    momentum = get_momentum(symbol)
    news_items = fetch_news(company)
    sentiment = average_sentiment(news_items)

    combined = 0.65 * momentum["momentum_score"] + 0.35 * sentiment

    if combined > 0.12:
        direction = "UP"
    elif combined < -0.12:
        direction = "DOWN"
    else:
        direction = "NEUTRAL"

    confidence = min(95, max(55, round(abs(combined) * 180 + 55)))

    data = {
        "symbol": symbol,
        "company": company,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "price": momentum["price"],
        "day_change_pct": momentum["day_change_pct"],
        "five_day_pct": momentum["five_day_pct"],
        "rsi": momentum["rsi"],
        "momentum_score": momentum["momentum_score"],
        "sentiment_score": sentiment,
        "news_count": len(news_items),
        "combined_score": round(combined, 3),
        "direction": direction,
        "confidence": confidence,
    }
    cache_set(key, data)
    return data


@app.get("/api/predict-all")
def predict_all():
    results, errors = [], []
    for symbol in STOCKS:
        try:
            results.append(predict(symbol))
        except HTTPException as exc:
            errors.append({"symbol": symbol, "error": exc.detail})
    return {"results": results, "errors": errors}


@app.get("/api/health")
def health():
    return {"status": "ok", "newsapi_configured": bool(NEWSAPI_KEY)}
