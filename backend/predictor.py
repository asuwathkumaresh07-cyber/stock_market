"""
predictor.py
------------
Core prediction engine: fetches price data, computes technical indicators,
runs the trained XGBoost model, layers in FinBERT news-sentiment, and
produces a final BUY / HOLD / SELL recommendation with an explanation.

IMPORTANT ASSUMPTION:
The model was trained on 7 features: ['RSI', 'MACD', 'SMA20', 'SMA50',
'Volume', 'Return', 'Volatility']. The exact formulas used during training
were not provided alongside the model, so this module uses standard,
widely-used definitions for each (documented inline). If your training
notebook computed these differently (e.g. RSI with a different window,
MACD as the histogram instead of the raw line, Volatility over a different
lookback), update the corresponding function below so inference matches
training exactly -- otherwise the model will see out-of-distribution
inputs and predictions will be unreliable.
"""

import pickle
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

from stocks import STOCKS

warnings.filterwarnings("ignore")

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "stock_model.pkl"
FEATURES_PATH = BASE_DIR / "features.pkl"

# ---------------------------------------------------------------------------
# Load model + feature order once at import time
# ---------------------------------------------------------------------------
with open(MODEL_PATH, "rb") as f:
    MODEL = pickle.load(f)

with open(FEATURES_PATH, "rb") as f:
    FEATURE_ORDER = pickle.load(f)  # ['RSI', 'MACD', 'SMA20', 'SMA50', 'Volume', 'Return', 'Volatility']

# Optional FinBERT sentiment pipeline (lazy-loaded so the API still boots
# even if transformers/torch aren't installed or there's no internet access
# to download the model on first run).
_SENTIMENT_PIPELINE = None


def _get_sentiment_pipeline():
    global _SENTIMENT_PIPELINE
    if _SENTIMENT_PIPELINE is None:
        try:
            from transformers import pipeline
            _SENTIMENT_PIPELINE = pipeline(
                "text-classification",
                model="ProsusAI/finbert",
                truncation=True,
            )
        except Exception as e:
            print(f"[predictor] FinBERT unavailable, falling back to neutral sentiment: {e}")
            _SENTIMENT_PIPELINE = False  # sentinel meaning "unavailable"
    return _SENTIMENT_PIPELINE


# ---------------------------------------------------------------------------
# Data fetching
# ---------------------------------------------------------------------------
def fetch_price_history(stock_symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    """Fetch OHLCV history from Yahoo Finance. Raises ValueError if no data."""
    ticker = yf.Ticker(stock_symbol)
    df = ticker.history(period=period, interval=interval)
    if df is None or df.empty:
        raise ValueError(f"No price data found for symbol '{stock_symbol}'")
    df = df.dropna()
    return df


# ---------------------------------------------------------------------------
# Technical indicators (must match training-time definitions -- see module docstring)
# ---------------------------------------------------------------------------
def calculate_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)  # neutral RSI if undefined


def calculate_macd(close: pd.Series, fast: int = 12, slow: int = 26) -> pd.Series:
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    return ema_fast - ema_slow  # raw MACD line (not the signal line or histogram)


def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute all 7 model features and append them as columns."""
    out = df.copy()
    out["RSI"] = calculate_rsi(out["Close"])
    out["MACD"] = calculate_macd(out["Close"])
    out["SMA20"] = out["Close"].rolling(window=20).mean()
    out["SMA50"] = out["Close"].rolling(window=50).mean()
    out["Volume"] = out["Volume"]
    out["Return"] = out["Close"].pct_change()
    out["Volatility"] = out["Return"].rolling(window=20).std()
    return out


# ---------------------------------------------------------------------------
# Explainability helpers (Phase 6)
# ---------------------------------------------------------------------------
def build_explanation(row: pd.Series, macd_prev: float) -> list:
    reasons = []
    if row["RSI"] >= 55:
        reasons.append("RSI indicates strength")
    elif row["RSI"] <= 45:
        reasons.append("RSI indicates weakness")

    if row["MACD"] > 0 and macd_prev <= 0:
        reasons.append("Positive MACD crossover")
    elif row["MACD"] > 0:
        reasons.append("MACD is positive")
    else:
        reasons.append("MACD is negative")

    if row["Close"] > row["SMA20"]:
        reasons.append("Price above SMA20")
    else:
        reasons.append("Price below SMA20")

    if row["SMA20"] > row["SMA50"]:
        reasons.append("SMA20 above SMA50 (uptrend)")
    else:
        reasons.append("SMA20 below SMA50 (downtrend)")

    return reasons


# ---------------------------------------------------------------------------
# Phase 1: Technical prediction
# ---------------------------------------------------------------------------
def predict_stock(stock_symbol: str) -> dict:
    """
    Stock Symbol -> Yahoo Finance -> Indicators -> stock_model.pkl -> Probability -> BUY/HOLD/SELL
    Returns technical-only result (no sentiment yet).
    """
    df = fetch_price_history(stock_symbol)
    ind = calculate_indicators(df)
    ind = ind.dropna(subset=FEATURE_ORDER)

    if ind.empty:
        raise ValueError(f"Not enough history to compute indicators for '{stock_symbol}'")

    latest = ind.iloc[-1]
    prev_close = ind.iloc[-2]["Close"] if len(ind) > 1 else latest["Close"]
    prev_macd = ind.iloc[-2]["MACD"] if len(ind) > 1 else 0.0

    X = latest[FEATURE_ORDER].values.reshape(1, -1).astype(float)
    proba_up = float(MODEL.predict_proba(X)[0][1])  # class 1 = "up"

    if proba_up >= 0.75:
        recommendation = "BUY"
    elif proba_up >= 0.55:
        recommendation = "HOLD"
    else:
        recommendation = "SELL"

    day_change_pct = ((latest["Close"] - prev_close) / prev_close * 100) if prev_close else 0.0

    return {
        "stock": stock_symbol,
        "technical_score": round(proba_up, 4),
        "recommendation": recommendation,
        "explanation": build_explanation(latest, prev_macd),
        "as_of": str(ind.index[-1].date()),
        "price": round(float(latest["Close"]), 2),
        "day_change_pct": round(float(day_change_pct), 2),
        "rsi": round(float(latest["RSI"]), 1),
    }


# ---------------------------------------------------------------------------
# Sentiment (FinBERT)
# ---------------------------------------------------------------------------
def get_news_sentiment(stock_symbol: str, max_headlines: int = 10) -> dict:
    """
    Pulls recent headlines for the symbol from Yahoo Finance and scores them
    with FinBERT. Returns a sentiment_score in [0, 1] (0 = very negative,
    0.5 = neutral, 1 = very positive) plus a human-readable label.
    Falls back to neutral (0.5) if no news or no FinBERT available.
    """
    try:
        ticker = yf.Ticker(stock_symbol)
        news_items = ticker.news or []
    except Exception:
        news_items = []

    headlines = []
    for item in news_items[:max_headlines]:
        title = item.get("title") or item.get("content", {}).get("title")
        if title:
            headlines.append(title)

    pipe = _get_sentiment_pipeline()
    if not headlines or pipe is False or pipe is None:
        return {
            "sentiment_score": 0.5,
            "label": "Neutral",
            "headlines_used": len(headlines),
            "headlines": [{"title": h, "label": "Neutral", "score": 0.5} for h in headlines],
        }

    results = pipe(headlines)
    # FinBERT labels: positive / negative / neutral
    score_map = {"positive": 1.0, "neutral": 0.5, "negative": 0.0}
    per_headline = []
    scores = []
    for title, r in zip(headlines, results):
        s = score_map.get(r["label"].lower(), 0.5)
        scores.append(s)
        per_headline.append({"title": title, "label": r["label"].capitalize(), "score": round(s, 3)})

    avg_score = float(np.mean(scores)) if scores else 0.5

    if avg_score >= 0.6:
        label = "Positive"
    elif avg_score <= 0.4:
        label = "Negative"
    else:
        label = "Neutral"

    return {
        "sentiment_score": round(avg_score, 4),
        "label": label,
        "headlines_used": len(headlines),
        "headlines": per_headline,
    }


# ---------------------------------------------------------------------------
# Phase 2: Combined recommendation engine
# ---------------------------------------------------------------------------
def get_recommendation(stock_symbol: str) -> dict:
    """
    final_score = technical_score * 0.8 + sentiment_score * 0.2
    >= 0.75 -> BUY, >= 0.55 -> HOLD, else SELL
    """
    technical = predict_stock(stock_symbol)
    sentiment = get_news_sentiment(stock_symbol)

    technical_score = technical["technical_score"]
    sentiment_score = sentiment["sentiment_score"]
    final_score = round(technical_score * 0.8 + sentiment_score * 0.2, 4)

    if final_score >= 0.75:
        recommendation = "BUY"
    elif final_score >= 0.55:
        recommendation = "HOLD"
    else:
        recommendation = "SELL"

    return {
        "stock": stock_symbol,
        "company": STOCKS.get(stock_symbol, stock_symbol),
        "price": technical["price"],
        "day_change_pct": technical["day_change_pct"],
        "rsi": technical["rsi"],
        "technical_score": technical_score,
        "sentiment_score": sentiment_score,
        "sentiment_label": sentiment["label"],
        "headlines_used": sentiment["headlines_used"],
        "final_score": final_score,
        "recommendation": recommendation,
        "confidence": round(final_score * 100),
        "explanation": technical["explanation"],
        "as_of": technical["as_of"],
    }


if __name__ == "__main__":
    import json
    print(json.dumps(get_recommendation("RELIANCE.NS"), indent=2))
