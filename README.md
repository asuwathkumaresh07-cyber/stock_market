# Tape & Trend — India Stock Recommendation Engine (AI-powered)

A working app that produces **BUY / HOLD / SELL** recommendations for 20 major NSE stocks using:

- **A trained XGBoost classifier** (`stock_model.pkl`) — reads RSI, MACD, SMA20, SMA50, Volume,
  Return, and Volatility, and outputs a probability the stock moves up.
- **FinBERT** (`ProsusAI/finbert`) — a pretrained transformer model that reads each stock's
  recent news headlines (pulled live via yfinance) and scores their sentiment.
- The two scores are blended (80% technical / 20% sentiment) into a final recommendation with
  a confidence % and a plain-language explanation.

This is a real ML/AI pipeline — not a hand-written heuristic. That also means it's heavier to
run: the first request downloads FinBERT's weights (~400MB) and inference runs on CPU unless
you have a GPU set up.

> ⚠️ **Important caveat**: the RSI/MACD/volatility formulas in `predictor.py` are standard,
> widely-used definitions, but they weren't necessarily the exact formulas used when
> `stock_model.pkl` was originally trained. If you still have the training notebook, compare it
> against `calculate_indicators()` in `predictor.py` — if the definitions don't match exactly,
> the model is seeing different inputs than it learned on, and predictions won't be reliable.

## Project structure

```
stock-predictor-india/
├── backend/
│   ├── main.py            # FastAPI routes (/api/predict, /api/predict-all, /api/news, ...)
│   ├── predictor.py        # XGBoost inference + FinBERT sentiment + explanation logic
│   ├── stocks.py            # tracked NSE symbols -> company names
│   ├── stock_model.pkl       # trained XGBoost model
│   ├── features.pkl          # feature order the model expects
│   └── requirements.txt
├── frontend/
│   ├── index.html          # dashboard
│   ├── style.css
│   └── app.js
└── README.md
```

## 1. Install & run the backend

```bash
cd backend
python -m venv venv
venv\Scripts\Activate.ps1        # Windows PowerShell
# source venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

`torch` + `transformers` are large installs (a few GB) — this step can take a while the first
time. Once running, check http://localhost:8000/api/health → `{"status":"ok", ...}`.

The **first** prediction request will pause for a bit while FinBERT's weights download from
Hugging Face — after that they're cached locally and every subsequent request is fast.

If FinBERT can't load (no internet, or `transformers`/`torch` missing), the app doesn't crash —
`get_news_sentiment()` falls back to a neutral 0.5 score automatically, and the model still
returns a recommendation based on price/technical data alone.

## 2. Run the frontend

```bash
cd frontend
python -m http.server 5500
```

Open http://localhost:5500. The dashboard polls the backend at `http://localhost:8000` — edit
`API_BASE` at the top of `app.js` if you host the backend elsewhere.

## API reference

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/stocks` | List of tracked symbols + company names |
| `GET /api/predict/{symbol}` | Full recommendation for one stock, e.g. `RELIANCE.NS` |
| `GET /api/predict-all` | Recommendation for every tracked stock (what the dashboard uses) |
| `GET /api/news/{symbol}` | Recent headlines with per-headline FinBERT sentiment |
| `POST /api/portfolio` | Body `{"symbols": ["RELIANCE.NS", "TCS.NS"]}` → recommendations for a custom list |

## How the recommendation is calculated

```
technical_score  = XGBoost predict_proba(RSI, MACD, SMA20, SMA50, Volume, Return, Volatility)
sentiment_score  = average FinBERT score across recent headlines (0 = very negative, 1 = very positive)
final_score      = technical_score × 0.8 + sentiment_score × 0.2

final_score ≥ 0.75  → BUY
final_score ≥ 0.55  → HOLD
otherwise           → SELL

confidence = final_score × 100
```

Weights live in `get_recommendation()` in `backend/predictor.py` — tune them freely.

## Extending it

- **More stocks**: add entries to `backend/stocks.py` (any valid Yahoo Finance `.NS` ticker).
- **Retrain the model**: if you have the original training data/notebook, retrain periodically
  as market conditions shift — a model trained on last year's data drifts over time.
- **Swap in Claude for sentiment**: FinBERT is fast and free but limited to positive/neutral/
  negative. An LLM call per headline (or batched) can reason about context, sarcasm, and
  magnitude — useful if you want written rationale rather than just a label.
- **Deploying**: host the backend (Render, Railway, a VPS with enough RAM for `torch`) and the
  frontend as a static site (Vercel, Netlify, GitHub Pages), then update `API_BASE` in `app.js`
  and CORS origins in `main.py`.

## Disclaimer

This tool is for educational purposes. Model predictions are not guaranteed to be accurate and
do not constitute financial advice. Past price or sentiment patterns are not reliable predictors
of future performance. Always do your own research and consult a licensed financial advisor
before trading.
