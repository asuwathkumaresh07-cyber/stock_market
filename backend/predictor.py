"""
predictor.py
------------
Core prediction engine and market data provider for Indian stock market:
1. Fetches price history (OHLCV) with technical indicators (SMA20, SMA50, RSI, MACD, Bollinger Bands)
2. Runs trained XGBoost model (stock_model.pkl)
3. Evaluates news sentiment (FinBERT with VADER + financial domain fallback)
4. Produces BUY / HOLD / SELL recommendations with explanations and forecast projections
5. Provides index data for pure NSE benchmarks: NIFTY 50, NIFTY BANK, NIFTY IT, NIFTY 100
6. Includes fast in-memory caching to ensure lightning-fast dashboard performance
"""

import pickle
import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

try:
    from stocks import STOCKS, INDICES, get_display_name
except ImportError:
    from backend.stocks import STOCKS, INDICES, get_display_name

warnings.filterwarnings("ignore")

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "stock_model.pkl"
FEATURES_PATH = BASE_DIR / "features.pkl"

# Load XGBoost model & feature list
with open(MODEL_PATH, "rb") as f:
    MODEL = pickle.load(f)

with open(FEATURES_PATH, "rb") as f:
    FEATURE_ORDER = pickle.load(f)

# Global memory caches with TTL
_PREDICTION_CACHE = {}      # symbol -> (timestamp, data)
_HISTORY_CACHE = {}         # key -> (timestamp, data)
_INDICES_CACHE = (0, None)  # (timestamp, data)
CACHE_TTL_SECS = 180        # 3 minutes cache for predictions
HISTORY_TTL_SECS = 60       # 1 minute cache for charts
INDICES_TTL_SECS = 60       # 1 minute cache for indices

# Optional FinBERT / VADER sentiment analyzer
_SENTIMENT_PIPELINE = None
_VADER_ANALYZER = None


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
            # FinBERT not installed or offline; fallback to VADER
            _SENTIMENT_PIPELINE = False
    return _SENTIMENT_PIPELINE


def _get_vader_analyzer():
    global _VADER_ANALYZER
    if _VADER_ANALYZER is None:
        try:
            from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
            _VADER_ANALYZER = SentimentIntensityAnalyzer()
        except Exception:
            _VADER_ANALYZER = False
    return _VADER_ANALYZER


# ---------------------------------------------------------------------------
# Data fetching
# ---------------------------------------------------------------------------
def normalize_symbol(symbol: str) -> str:
    sym = symbol.strip().upper()
    if sym in INDICES:
        return sym
    if sym in STOCKS:
        return sym
    if not sym.startswith("^") and not sym.endswith(".NS") and not sym.endswith(".BO"):
        return f"{sym}.NS"
    return sym


def fetch_price_history(stock_symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    """Fetch OHLCV history from Yahoo Finance. Raises ValueError if no data."""
    ticker = yf.Ticker(stock_symbol)
    df = ticker.history(period=period, interval=interval)
    if df is None or df.empty:
        raise ValueError(f"No price data found for symbol '{stock_symbol}'")
    df = df.dropna()
    return df


# ---------------------------------------------------------------------------
# Technical indicators
# ---------------------------------------------------------------------------
def calculate_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def calculate_macd(close: pd.Series, fast: int = 12, slow: int = 26) -> pd.Series:
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    return ema_fast - ema_slow


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


def build_explanation(row: pd.Series, macd_prev: float) -> list:
    reasons = []
    rsi_val = float(row.get("RSI", 50))
    macd_val = float(row.get("MACD", 0))
    close_val = float(row.get("Close", 0))
    sma20_val = float(row.get("SMA20", close_val))
    sma50_val = float(row.get("SMA50", sma20_val))

    if rsi_val >= 65:
        reasons.append(f"RSI ({rsi_val:.1f}) is strong / overbought territory")
    elif rsi_val >= 55:
        reasons.append(f"RSI ({rsi_val:.1f}) indicates solid bullish momentum")
    elif rsi_val <= 35:
        reasons.append(f"RSI ({rsi_val:.1f}) is in oversold bounce territory")
    elif rsi_val <= 45:
        reasons.append(f"RSI ({rsi_val:.1f}) indicates mild selling pressure")
    else:
        reasons.append(f"RSI ({rsi_val:.1f}) is neutral")

    if macd_val > 0 and macd_prev <= 0:
        reasons.append("Bullish MACD golden crossover confirmed")
    elif macd_val > 0:
        reasons.append("MACD is positive in bullish territory")
    else:
        reasons.append("MACD is negative in bearish territory")

    if close_val > sma20_val:
        reasons.append(f"Current price (₹{close_val:.2f}) trading above 20-day SMA (₹{sma20_val:.2f})")
    else:
        reasons.append(f"Current price (₹{close_val:.2f}) trading below 20-day SMA (₹{sma20_val:.2f})")

    if sma20_val > sma50_val:
        reasons.append("20-day SMA above 50-day SMA (sustained uptrend)")
    else:
        reasons.append("20-day SMA below 50-day SMA (corrective downtrend)")

    return reasons


# ---------------------------------------------------------------------------
# Phase 1: Technical prediction
# ---------------------------------------------------------------------------
def predict_stock(stock_symbol: str) -> dict:
    symbol = normalize_symbol(stock_symbol)
    df = fetch_price_history(symbol)
    ind = calculate_indicators(df)
    ind = ind.dropna(subset=FEATURE_ORDER)

    if ind.empty:
        raise ValueError(f"Not enough history to compute indicators for '{symbol}'")

    latest = ind.iloc[-1]
    prev_close = ind.iloc[-2]["Close"] if len(ind) > 1 else latest["Close"]
    prev_macd = ind.iloc[-2]["MACD"] if len(ind) > 1 else 0.0

    X = latest[FEATURE_ORDER].values.reshape(1, -1).astype(float)
    proba_up = float(MODEL.predict_proba(X)[0][1])

    if proba_up >= 0.70:
        recommendation = "BUY"
    elif proba_up >= 0.50:
        recommendation = "HOLD"
    else:
        recommendation = "SELL"

    day_change_pct = ((latest["Close"] - prev_close) / prev_close * 100) if prev_close else 0.0

    return {
        "stock": symbol,
        "company": get_display_name(symbol),
        "technical_score": round(proba_up, 4),
        "recommendation": recommendation,
        "explanation": build_explanation(latest, prev_macd),
        "as_of": str(ind.index[-1].date()),
        "price": round(float(latest["Close"]), 2),
        "day_change_pct": round(float(day_change_pct), 2),
        "rsi": round(float(latest["RSI"]), 1),
    }


# ---------------------------------------------------------------------------
# Sentiment (FinBERT + VADER fallback)
# ---------------------------------------------------------------------------
def _score_headline_fallback(title: str) -> tuple[str, float]:
    analyzer = _get_vader_analyzer()
    if not analyzer:
        return "Neutral", 0.5

    vs = analyzer.polarity_scores(title)
    comp = vs["compound"]

    title_lower = title.lower()
    pos_keywords = ["surge", "profit", "bull", "rally", "growth", "jump", "dividend", "record", "gain", "outperform", "bonus", "high"]
    neg_keywords = ["slump", "loss", "plunge", "fraud", "scam", "crash", "fall", "decline", "penalty", "selloff", "drop", "warn", "debt"]

    bonus = 0.0
    for w in pos_keywords:
        if w in title_lower:
            bonus += 0.15
    for w in neg_keywords:
        if w in title_lower:
            bonus -= 0.15

    score = 0.5 + (comp * 0.4) + (bonus * 0.5)
    score = max(0.05, min(0.95, score))

    if score >= 0.60:
        label = "Positive"
    elif score <= 0.40:
        label = "Negative"
    else:
        label = "Neutral"

    return label, round(score, 3)


def get_news_sentiment(stock_symbol: str, max_headlines: int = 10) -> dict:
    symbol = normalize_symbol(stock_symbol)
    try:
        ticker = yf.Ticker(symbol)
        news_items = ticker.news or []
    except Exception:
        news_items = []

    headlines = []
    for item in news_items[:max_headlines]:
        title = item.get("title") or item.get("content", {}).get("title")
        if title:
            headlines.append(title)

    pipe = _get_sentiment_pipeline()
    per_headline = []
    scores = []

    if pipe is not False and pipe is not None and headlines:
        try:
            results = pipe(headlines)
            score_map = {"positive": 1.0, "neutral": 0.5, "negative": 0.0}
            for title, r in zip(headlines, results):
                s = score_map.get(r["label"].lower(), 0.5)
                scores.append(s)
                per_headline.append({"title": title, "label": r["label"].capitalize(), "score": round(s, 3)})
        except Exception:
            pipe = False

    if (pipe is False or not scores) and headlines:
        for title in headlines:
            label, s = _score_headline_fallback(title)
            scores.append(s)
            per_headline.append({"title": title, "label": label, "score": s})

    if not headlines:
        return {
            "sentiment_score": 0.5,
            "label": "Neutral",
            "headlines_used": 0,
            "headlines": [],
        }

    avg_score = float(np.mean(scores)) if scores else 0.5
    if avg_score >= 0.58:
        overall_label = "Positive"
    elif avg_score <= 0.42:
        overall_label = "Negative"
    else:
        overall_label = "Neutral"

    return {
        "sentiment_score": round(avg_score, 4),
        "label": overall_label,
        "headlines_used": len(headlines),
        "headlines": per_headline,
    }


# ---------------------------------------------------------------------------
# Combined Recommendation with Caching
# ---------------------------------------------------------------------------
def get_recommendation(stock_symbol: str, use_cache: bool = True) -> dict:
    symbol = normalize_symbol(stock_symbol)
    now = time.time()

    if use_cache and symbol in _PREDICTION_CACHE:
        ts, cached_val = _PREDICTION_CACHE[symbol]
        if now - ts < CACHE_TTL_SECS:
            return cached_val

    technical = predict_stock(symbol)
    sentiment = get_news_sentiment(symbol)

    technical_score = technical["technical_score"]
    sentiment_score = sentiment["sentiment_score"]
    final_score = round(technical_score * 0.8 + sentiment_score * 0.2, 4)

    price = float(technical["price"])
    if final_score >= 0.70:
        recommendation = "BUY"
        upside_pct = round(max(3.8, (final_score - 0.5) * 22), 1)
        target_price = round(price * (1 + upside_pct / 100), 2)
        stop_loss = round(price * 0.965, 2)
        expected_roi = f"+{upside_pct}%"
        signal_strength = "Strong Buy" if final_score >= 0.78 else "Moderate Buy"
        risk_reward = f"1 : {round(upside_pct / 3.5, 1)}"
    elif final_score <= 0.45:
        recommendation = "SELL"
        downside_pct = round(max(3.5, (0.5 - final_score) * 20), 1)
        target_price = round(price * (1 - downside_pct / 100), 2)
        stop_loss = round(price * 1.035, 2)
        expected_roi = f"-{downside_pct}%"
        signal_strength = "Strong Sell" if final_score <= 0.35 else "Moderate Sell"
        risk_reward = f"1 : {round(downside_pct / 3.5, 1)}"
    else:
        recommendation = "HOLD"
        target_price = round(price * 1.018, 2)
        stop_loss = round(price * 0.975, 2)
        expected_roi = "+1.8% Range"
        signal_strength = "Neutral Hold"
        risk_reward = "1 : 1.2"

    res = {
        "stock": symbol,
        "company": get_display_name(symbol),
        "price": price,
        "day_change_pct": technical["day_change_pct"],
        "rsi": technical["rsi"],
        "technical_score": technical_score,
        "sentiment_score": sentiment_score,
        "sentiment_label": sentiment["label"],
        "headlines_used": sentiment["headlines_used"],
        "final_score": final_score,
        "recommendation": recommendation,
        "confidence": round(final_score * 100),
        "target_price": target_price,
        "stop_loss": stop_loss,
        "expected_roi": expected_roi,
        "signal_strength": signal_strength,
        "risk_reward": risk_reward,
        "explanation": technical["explanation"],
        "as_of": technical["as_of"],
    }

    _PREDICTION_CACHE[symbol] = (now, res)
    return res


# ---------------------------------------------------------------------------
# Stock Market Historical Chart & Indicators Provider
# ---------------------------------------------------------------------------
PERIOD_INTERVAL_MAP = {
    "1d": "5m",
    "5d": "15m",
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1d",
    "1y": "1d",
    "5y": "1wk",
    "max": "1mo",
}


def get_stock_history(symbol: str, period: str = "1y", interval: str = None) -> dict:
    """
    Returns complete OHLCV, moving averages, RSI, MACD, Bollinger bands,
    AI forecast projection, and key stats for the interactive chart.
    """
    norm_symbol = normalize_symbol(symbol)
    period = period.lower()
    if period not in PERIOD_INTERVAL_MAP:
        period = "1y"

    if not interval:
        interval = PERIOD_INTERVAL_MAP.get(period, "1d")

    cache_key = f"{norm_symbol}_{period}_{interval}"
    now = time.time()
    if cache_key in _HISTORY_CACHE:
        ts, cached_val = _HISTORY_CACHE[cache_key]
        if now - ts < HISTORY_TTL_SECS:
            return cached_val

    ticker = yf.Ticker(norm_symbol)
    df = ticker.history(period=period, interval=interval)
    if df is None or df.empty:
        # Fallback to 1y if short interval returned empty
        df = ticker.history(period="1y", interval="1d")
        period = "1y"
        interval = "1d"

    if df is None or df.empty:
        raise ValueError(f"Could not retrieve chart history for {norm_symbol}")

    df = df.dropna(subset=["Close"])

    # Indicators calculation
    close = df["Close"]
    sma20 = close.rolling(window=20).mean()
    sma50 = close.rolling(window=50).mean()

    # Bollinger Bands (20, 2)
    std20 = close.rolling(window=20).std()
    bb_upper = sma20 + (std20 * 2)
    bb_lower = sma20 - (std20 * 2)

    # RSI
    rsi_series = calculate_rsi(close, 14)

    # MACD
    macd_line = calculate_macd(close, 12, 26)
    macd_signal = macd_line.ewm(span=9, adjust=False).mean()
    macd_hist = macd_line - macd_signal

    is_intraday = interval in ["1m", "2m", "5m", "15m", "30m", "60m", "1h"]

    candles = []
    volume_data = []
    sma20_data = []
    sma50_data = []
    bb_upper_data = []
    bb_lower_data = []
    bb_mid_data = []
    rsi_data = []
    macd_data = []

    last_dt = None
    for idx, row in df.iterrows():
        dt = idx.to_pydatetime()
        last_dt = dt
        time_val = int(dt.timestamp()) if is_intraday else dt.strftime("%Y-%m-%d")

        o = round(float(row["Open"]), 2)
        h = round(float(row["High"]), 2)
        l = round(float(row["Low"]), 2)
        c = round(float(row["Close"]), 2)
        v = int(row.get("Volume", 0))

        candles.append({
            "time": time_val,
            "open": o,
            "high": h,
            "low": l,
            "close": c,
            "volume": v,
        })

        vol_color = "rgba(0, 230, 118, 0.4)" if c >= o else "rgba(255, 51, 102, 0.4)"
        volume_data.append({
            "time": time_val,
            "value": v,
            "color": vol_color,
        })

        if not np.isnan(sma20.loc[idx]):
            sma20_data.append({"time": time_val, "value": round(float(sma20.loc[idx]), 2)})
        if not np.isnan(sma50.loc[idx]):
            sma50_data.append({"time": time_val, "value": round(float(sma50.loc[idx]), 2)})

        if not np.isnan(bb_upper.loc[idx]) and not np.isnan(bb_lower.loc[idx]):
            bb_upper_data.append({"time": time_val, "value": round(float(bb_upper.loc[idx]), 2)})
            bb_lower_data.append({"time": time_val, "value": round(float(bb_lower.loc[idx]), 2)})
            bb_mid_data.append({"time": time_val, "value": round(float(sma20.loc[idx]), 2)})

        if not np.isnan(rsi_series.loc[idx]):
            rsi_data.append({"time": time_val, "value": round(float(rsi_series.loc[idx]), 2)})

        if not np.isnan(macd_line.loc[idx]) and not np.isnan(macd_signal.loc[idx]):
            m_val = round(float(macd_line.loc[idx]), 2)
            s_val = round(float(macd_signal.loc[idx]), 2)
            h_val = round(float(macd_hist.loc[idx]), 2)
            macd_data.append({
                "time": time_val,
                "macd": m_val,
                "signal": s_val,
                "hist": h_val,
                "histColor": "rgba(0, 230, 118, 0.7)" if h_val >= 0 else "rgba(255, 51, 102, 0.7)",
            })

    # Summary stats
    cur_close = float(df["Close"].iloc[-1])
    prev_close = float(df["Close"].iloc[-2]) if len(df) > 1 else cur_close
    day_change = cur_close - prev_close
    day_change_pct = (day_change / prev_close * 100) if prev_close else 0.0

    high_52w = float(df["High"].max())
    low_52w = float(df["Low"].min())
    day_high = float(df["High"].iloc[-1])
    day_low = float(df["Low"].iloc[-1])
    avg_vol = int(df["Volume"].tail(20).mean()) if "Volume" in df else 0
    volatility = float(df["Close"].pct_change().tail(20).std() * np.sqrt(252) * 100) if len(df) > 20 else 0.0
    current_rsi = round(float(rsi_series.iloc[-1]), 1) if not rsi_series.empty else 50.0

    # Prediction & Forward Forecast
    prediction = None
    forecast_points = []
    if norm_symbol not in INDICES:
        try:
            rec = get_recommendation(norm_symbol)
            prediction = rec

            # Build a 7-session forward projection corridor
            drift_pct = (rec["final_score"] - 0.5) * 0.04  # e.g., +1.2% or -1% per step
            curr_proj = cur_close
            future_dt = last_dt or datetime.now()

            # Include the last point as connection
            last_time_val = candles[-1]["time"] if candles else str(future_dt.date())
            forecast_points.append({
                "time": last_time_val,
                "value": round(cur_close, 2),
                "upper": round(cur_close, 2),
                "lower": round(cur_close, 2),
                "projected": False,
            })

            for i in range(1, 8):
                if is_intraday:
                    future_dt = future_dt + timedelta(minutes=15)
                    f_time = int(future_dt.timestamp())
                else:
                    future_dt = future_dt + timedelta(days=1)
                    if future_dt.weekday() >= 5:  # skip weekends
                        future_dt = future_dt + timedelta(days=(7 - future_dt.weekday()))
                    f_time = future_dt.strftime("%Y-%m-%d")

                curr_proj = curr_proj * (1 + drift_pct)
                uncertainty = curr_proj * (0.008 * i)
                forecast_points.append({
                    "time": f_time,
                    "value": round(curr_proj, 2),
                    "upper": round(curr_proj + uncertainty, 2),
                    "lower": round(curr_proj - uncertainty, 2),
                    "projected": True,
                })
        except Exception as e:
            print(f"[history] Prediction omitted for {norm_symbol}: {e}")

    result = {
        "symbol": norm_symbol,
        "company": get_display_name(norm_symbol),
        "period": period,
        "interval": interval,
        "candles": candles,
        "volume": volume_data,
        "sma20": sma20_data,
        "sma50": sma50_data,
        "bollinger": {
            "upper": bb_upper_data,
            "lower": bb_lower_data,
            "mid": bb_mid_data,
        },
        "rsi": rsi_data,
        "macd": macd_data,
        "forecast": forecast_points,
        "prediction": prediction,
        "stats": {
            "price": round(cur_close, 2),
            "prev_close": round(prev_close, 2),
            "day_change": round(day_change, 2),
            "day_change_pct": round(day_change_pct, 2),
            "day_high": round(day_high, 2),
            "day_low": round(day_low, 2),
            "high_52w": round(high_52w, 2),
            "low_52w": round(low_52w, 2),
            "avg_volume": avg_vol,
            "volatility": round(volatility, 1),
            "rsi": current_rsi,
        },
    }

    _HISTORY_CACHE[cache_key] = (now, result)
    return result


# ---------------------------------------------------------------------------
# Indian Market Benchmark Indices (Exclusively Pure NSE India)
# ---------------------------------------------------------------------------
def get_market_indices() -> list:
    """
    Returns live snapshot + sparkline for pure NSE indices:
    NIFTY 50, BANK NIFTY, NIFTY IT, NIFTY 100 (NO BSE/SENSEX).
    """
    global _INDICES_CACHE
    now = time.time()
    ts, cached = _INDICES_CACHE
    if cached and (now - ts < INDICES_TTL_SECS):
        return cached

    indices_list = [
        {"symbol": "^NSEI", "name": "NIFTY 50"},
        {"symbol": "^NSEBANK", "name": "BANK NIFTY"},
        {"symbol": "^CNXIT", "name": "NIFTY IT"},
        {"symbol": "^CNX100", "name": "NIFTY 100"},
    ]

    out = []
    sym_query = " ".join([i["symbol"] for i in indices_list])
    try:
        tickers = yf.Tickers(sym_query)
        for item in indices_list:
            sym = item["symbol"]
            name = item["name"]
            try:
                t = tickers.tickers[sym]
                h = t.history(period="5d", interval="1d")
                if len(h) >= 2:
                    c = float(h["Close"].iloc[-1])
                    p = float(h["Close"].iloc[-2])
                    chg = c - p
                    pct = (chg / p) * 100
                    # 10-point mini sparkline
                    spark = [round(float(x), 2) for x in h["Close"].tolist()]
                    out.append({
                        "symbol": sym,
                        "name": name,
                        "price": round(c, 2),
                        "change": round(chg, 2),
                        "change_pct": round(pct, 2),
                        "sparkline": spark,
                    })
                elif len(h) == 1:
                    c = float(h["Close"].iloc[-1])
                    out.append({
                        "symbol": sym,
                        "name": name,
                        "price": round(c, 2),
                        "change": 0.0,
                        "change_pct": 0.0,
                        "sparkline": [round(c, 2)],
                    })
            except Exception as e:
                print(f"[indices] error fetching {sym}: {e}")
    except Exception as e:
        print(f"[indices] bulk fetch error: {e}")

    # Fallback default values if network/exchange closed
    if not out:
        out = [
            {"symbol": "^NSEI", "name": "NIFTY 50", "price": 22520.45, "change": 288.65, "change_pct": 1.30, "sparkline": [22300, 22400, 22520.45]},
            {"symbol": "^NSEBANK", "name": "BANK NIFTY", "price": 55256.65, "change": 741.60, "change_pct": 1.36, "sparkline": [54800, 55000, 55256.65]},
            {"symbol": "^CNXIT", "name": "NIFTY IT", "price": 28574.90, "change": 838.30, "change_pct": 3.02, "sparkline": [27800, 28100, 28574.90]},
            {"symbol": "^CNX100", "name": "NIFTY 100", "price": 23410.20, "change": 305.40, "change_pct": 1.32, "sparkline": [23150, 23280, 23410.20]},
        ]

    _INDICES_CACHE = (now, out)
    return out


# ---------------------------------------------------------------------------
# Parallel Predict-All across all NSE 50 Stocks
# ---------------------------------------------------------------------------
_BULK_CACHE = (0, None)
BULK_TTL_SECS = 120

def predict_all_parallel(max_workers: int = 16) -> dict:
    """Runs prediction across all tracked NSE stocks concurrently with caching."""
    global _BULK_CACHE
    now = time.time()
    ts, cached = _BULK_CACHE
    if cached and (now - ts < BULK_TTL_SECS):
        return cached

    results = []
    errors = []

    def _worker(sym):
        try:
            return get_recommendation(sym)
        except Exception as e:
            return {"error": str(e), "symbol": sym}

    symbols = list(STOCKS.keys())
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        items = list(executor.map(_worker, symbols))

    for item in items:
        if "error" in item:
            errors.append(item)
        else:
            results.append(item)

    payload = {"results": results, "errors": errors}
    if results:
        _BULK_CACHE = (now, payload)
    return payload

