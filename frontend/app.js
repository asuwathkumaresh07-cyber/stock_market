// Point this at wherever the FastAPI backend is running.
const API_BASE = (window.API_BASE || "http://localhost:8000").replace(/\/$/, "");

const grid = document.getElementById("grid");
const tickerTrack = document.getElementById("tickerTrack");
const searchBox = document.getElementById("searchBox");
const filterButtons = document.getElementById("filterButtons");
const refreshBtn = document.getElementById("refreshBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalContent = document.getElementById("modalContent");
const modalClose = document.getElementById("modalClose");

let allResults = [];
let activeFilter = "ALL";

function setStatus(state, text) {
  statusDot.className = "dot" + (state === "live" ? " live" : state === "error" ? " error" : "");
  statusText.textContent = text;
}

function fmtPct(n) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function directionClass(rec) {
  return rec === "BUY" ? "up" : rec === "SELL" ? "down" : "neutral";
}

async function loadPredictions() {
  setStatus("connecting", "fetching predictions…");
  grid.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const s = document.createElement("div");
    s.className = "card skeleton";
    s.innerHTML = `<div class="card-sym">····</div>`;
    grid.appendChild(s);
  }

  try {
    const res = await fetch(`${API_BASE}/api/predict-all`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allResults = data.results || [];
    setStatus("live", `${allResults.length} stocks · updated ${new Date().toLocaleTimeString()}`);
    renderTicker(allResults);
    renderGrid();
  } catch (err) {
    setStatus("error", "backend unreachable — is the API running on :8000?");
    grid.innerHTML = `<p style="color:var(--muted); grid-column:1/-1;">
      Couldn't reach the backend at <code>${API_BASE}</code>. Start it with
      <code>uvicorn app:app --reload --port 8000</code> from the backend folder, then hit Refresh.
    </p>`;
  }
}

function renderTicker(results) {
  if (!results.length) return;
  const items = results
    .map(
      (r) => `<span class="ticker-item">
        <span class="sym">${r.stock.replace(".NS", "")}</span>
        <span class="chg ${directionClass(r.recommendation)}">${fmtPct(r.day_change_pct)} · ${r.recommendation}</span>
      </span>`
    )
    .join("");
  // duplicate for seamless scroll loop
  tickerTrack.innerHTML = items + items;
}

function renderGrid() {
  const query = searchBox.value.trim().toLowerCase();
  const filtered = allResults.filter((r) => {
    const matchesFilter = activeFilter === "ALL" || r.recommendation === activeFilter;
    const matchesQuery =
      !query ||
      r.stock.toLowerCase().includes(query) ||
      r.company.toLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });

  if (!filtered.length) {
    grid.innerHTML = `<p style="color:var(--muted); grid-column:1/-1;">No stocks match that filter.</p>`;
    return;
  }

  grid.innerHTML = filtered
    .map((r) => {
      const dirClass = directionClass(r.recommendation);
      const dialColor =
        r.recommendation === "BUY" ? "var(--up)" : r.recommendation === "SELL" ? "var(--down)" : "var(--gold)";
      return `
      <article class="card" tabindex="0" data-symbol="${r.stock}">
        <div class="card-top">
          <div>
            <div class="card-sym">${r.stock.replace(".NS", "")}</div>
            <div class="card-name">${r.company}</div>
          </div>
          <span class="badge ${r.recommendation}">${r.recommendation}</span>
        </div>
        <div class="card-mid">
          <div class="price-block">
            <div class="price">₹${r.price.toLocaleString("en-IN")}</div>
            <div class="chg ${dirClass}">${fmtPct(r.day_change_pct)} today</div>
          </div>
          <div class="dial" style="--pct:${r.confidence}; --dial-color:${dialColor};">
            <span>${r.confidence}%</span>
          </div>
        </div>
        <div class="card-bottom">
          <span>RSI ${r.rsi}</span>
          <span>news: ${r.sentiment_label}</span>
          <span>${r.headlines_used} headlines</span>
        </div>
      </article>`;
    })
    .join("");

  grid.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => openModal(card.dataset.symbol));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openModal(card.dataset.symbol);
    });
  });
}

async function openModal(symbol) {
  const r = allResults.find((x) => x.stock === symbol);
  if (!r) return;

  const explanationHtml = (r.explanation || [])
    .map((line) => `<li>${line}</li>`)
    .join("");

  modalContent.innerHTML = `
    <h2>${r.company} <span style="color:var(--muted); font-weight:400;">${r.stock.replace(".NS", "")}</span></h2>
    <div class="modal-sub">As of ${r.as_of} · recommendation: <strong>${r.recommendation}</strong> (${r.confidence}% confidence)</div>
    <div style="display:flex; gap:18px; flex-wrap:wrap; font-family:var(--mono); font-size:12.5px; color:var(--muted); margin-bottom:10px;">
      <span>Technical (XGBoost) ${r.technical_score}</span>
      <span>Sentiment (FinBERT) ${r.sentiment_score} · ${r.sentiment_label}</span>
      <span>Final score ${r.final_score}</span>
      <span>RSI ${r.rsi}</span>
    </div>
    <ul style="margin:0 0 16px; padding-left:18px; font-size:13px; color:var(--text); line-height:1.7;">
      ${explanationHtml}
    </ul>
    <div id="newsList">Loading headlines…</div>
  `;
  modalBackdrop.classList.add("open");

  try {
    const res = await fetch(`${API_BASE}/api/news/${encodeURIComponent(symbol)}`);
    const data = await res.json();
    const newsList = document.getElementById("newsList");
    if (!data.articles || !data.articles.length) {
      newsList.innerHTML = `<p style="color:var(--muted); font-size:13px;">No recent headlines found for this stock right now.</p>`;
      return;
    }
    newsList.innerHTML = data.articles
      .map(
        (a) => `<div class="news-item">
          <span>${a.title}</span>
          <div class="meta">FinBERT: ${a.label} (${a.score})</div>
        </div>`
      )
      .join("");
  } catch {
    document.getElementById("newsList").innerHTML = `<p style="color:var(--muted); font-size:13px;">Couldn't load headlines.</p>`;
  }
}

modalClose.addEventListener("click", () => modalBackdrop.classList.remove("open"));
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) modalBackdrop.classList.remove("open");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") modalBackdrop.classList.remove("open");
});

searchBox.addEventListener("input", renderGrid);
refreshBtn.addEventListener("click", loadPredictions);
filterButtons.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  filterButtons.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  activeFilter = btn.dataset.filter;
  renderGrid();
});

loadPredictions();
setInterval(loadPredictions, 5 * 60 * 1000); // auto-refresh every 5 minutes
