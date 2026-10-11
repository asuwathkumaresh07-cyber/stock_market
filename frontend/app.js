/**
 * Bharat Market Pulse — Main Frontend Controller
 * Interactive TradingView Financial Chart + AI Predictor Engine
 * Dual-Theme (Dark / Light) Glassmorphic System
 */

// 1. API Configuration
const API_BASE = (function () {
  if (window.API_BASE) return window.API_BASE;
  const origin = window.location.origin;
  if (origin.includes(":8000")) return origin;
  return "http://localhost:8000";
})();

// 2. Application State
let currentSymbol = "RELIANCE.NS";
let currentPeriod = "1y";
let currentChartType = "candles"; // 'candles' or 'area'
let activeFilter = "ALL";
let activeSort = "conf_desc";
let allPredictions = [];
let allStocksList = [];
let marketIndices = [];
let currentHistoryData = null;

// Indicator toggles state
const indicatorsState = {
  sma20: true,
  sma50: true,
  bb: false,
  forecast: true,
  rsi: false,
  macd: false,
};

// Lightweight Charts instances & series references
let mainChart = null;
let rsiChart = null;
let macdChart = null;

let candleSeries = null;
let areaSeries = null;
let volumeSeries = null;
let sma20Series = null;
let sma50Series = null;
let bbUpperSeries = null;
let bbLowerSeries = null;
let forecastSeries = null;
let forecastUpperSeries = null;
let forecastLowerSeries = null;

let rsiLineSeries = null;
let macdLineSeries = null;
let macdSignalSeries = null;
let macdHistSeries = null;

// DOM Elements
const grid = document.getElementById("grid");
const searchBox = document.getElementById("searchBox");
const filterButtons = document.getElementById("filterButtons");
const sortSelect = document.getElementById("sortSelect");
const globalRefreshBtn = document.getElementById("globalRefreshBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const tickerTrack = document.getElementById("tickerTrack");
const indicesContainer = document.getElementById("indicesContainer");
const quickStockTabs = document.getElementById("quickStockTabs");
const timeframeGroup = document.getElementById("timeframeGroup");
const quickSearchInput = document.getElementById("quickSearchInput");
const quickSearchResults = document.getElementById("quickSearchResults");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeToggleLabel = document.getElementById("themeToggleLabel");

// Modal Elements
const modal = document.getElementById("analysisModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalStockTitle = document.getElementById("modalStockTitle");
const modalStockSub = document.getElementById("modalStockSub");
const modalBody = document.getElementById("modalBody");

// ==========================================================================
// THEME MANAGEMENT (Dark & Light Mode)
// ==========================================================================
const THEME_STORAGE_KEY = "bharat_market_theme";

function getCurrentTheme() {
  const currentAttr = document.documentElement.getAttribute("data-theme");
  if (currentAttr === "light" || currentAttr === "dark") return currentAttr;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch (e) {}
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function applyTheme(theme, updateCharts = true) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {}

  if (themeToggleLabel) {
    themeToggleLabel.textContent = theme === "dark" ? "Dark" : "Light";
  }
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute(
      "title",
      theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"
    );
  }

  // Manage background video: pause in light mode (clean white/blue canvas), resume in dark mode
  const vA = document.getElementById("bgVideoA");
  const vB = document.getElementById("bgVideoB");
  if (vA && vB) {
    if (theme === "light") {
      try { vA.pause(); vB.pause(); } catch (e) {}
    } else {
      try {
        const activeVid = vA.classList.contains("is-active") ? vA : vB;
        activeVid.play();
      } catch (e) {}
    }
  }

  if (updateCharts) {
    updateChartsTheme(theme);
  }
}

function getChartThemeOptions(theme) {
  const isDark = theme === "dark";
  return {
    layout: {
      background: { type: "solid", color: isDark ? "transparent" : "#ffffff" },
      textColor: isDark ? "#ffffff" : "#475569",
      fontFamily: "'IBM Plex Mono', 'Inter', monospace",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9" },
      horzLines: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9" },
    },
    crosshair: {
      vertLine: {
        color: isDark ? "rgba(56, 189, 248, 0.75)" : "rgba(37, 99, 235, 0.75)",
        width: 1,
        style: 3,
        labelBackgroundColor: isDark ? "rgba(12, 28, 62, 0.95)" : "#0f172a",
      },
      horzLine: {
        color: isDark ? "rgba(56, 189, 248, 0.75)" : "rgba(37, 99, 235, 0.75)",
        width: 1,
        style: 3,
        labelBackgroundColor: isDark ? "rgba(12, 28, 62, 0.95)" : "#0f172a",
      },
    },
    rightPriceScale: {
      borderColor: isDark ? "rgba(255, 255, 255, 0.18)" : "#e2e8f0",
    },
    timeScale: {
      borderColor: isDark ? "rgba(255, 255, 255, 0.18)" : "#e2e8f0",
    },
  };
}

function updateChartsTheme(theme) {
  if (!mainChart) return;
  const isDark = theme === "dark";
  const opts = getChartThemeOptions(theme);
  try {
    mainChart.applyOptions(opts);
    if (rsiChart) rsiChart.applyOptions(opts);
    if (macdChart) macdChart.applyOptions(opts);

    if (candleSeries) {
      candleSeries.applyOptions({
        upColor: isDark ? "#00E676" : "#16a34a",
        downColor: isDark ? "#FF3366" : "#dc2626",
        borderUpColor: isDark ? "#00E676" : "#16a34a",
        borderDownColor: isDark ? "#FF3366" : "#dc2626",
        wickUpColor: isDark ? "#00E676" : "#16a34a",
        wickDownColor: isDark ? "#FF3366" : "#dc2626",
      });
    }

    if (areaSeries) {
      areaSeries.applyOptions({
        topColor: isDark ? "rgba(56, 189, 248, 0.45)" : "rgba(37, 99, 235, 0.22)",
        bottomColor: isDark ? "rgba(56, 189, 248, 0.0)" : "rgba(37, 99, 235, 0.0)",
        lineColor: isDark ? "#38bdf8" : "#2563eb",
      });
    }

    if (sma20Series) {
      sma20Series.applyOptions({
        color: isDark ? "#FBBF24" : "#d97706",
      });
    }

    if (sma50Series) {
      sma50Series.applyOptions({
        color: isDark ? "#38BDF8" : "#2563eb",
      });
    }

    if (forecastSeries) {
      forecastSeries.applyOptions({
        color: isDark ? "#00f0ff" : "#1d4ed8",
      });
    }

    if (forecastUpperSeries && forecastLowerSeries) {
      forecastUpperSeries.applyOptions({
        color: isDark ? "rgba(0, 240, 255, 0.5)" : "rgba(37, 99, 235, 0.45)",
      });
      forecastLowerSeries.applyOptions({
        color: isDark ? "rgba(0, 240, 255, 0.5)" : "rgba(37, 99, 235, 0.45)",
      });
    }

    if (rsiLineSeries) {
      rsiLineSeries.applyOptions({
        color: isDark ? "#E879F9" : "#7c3aed",
      });
    }

    if (macdLineSeries) {
      macdLineSeries.applyOptions({
        color: isDark ? "#00F0FF" : "#2563eb",
      });
    }

    if (macdSignalSeries) {
      macdSignalSeries.applyOptions({
        color: isDark ? "#FBBF24" : "#d97706",
      });
    }

    // Themed volume update
    if (currentHistoryData && volumeSeries) {
      const isLight = !isDark;
      const themedVol = sanitizeData(
        (currentHistoryData.volume || []).map((v) => {
          let c = v.color;
          if (isLight) {
            if (c && c.includes("230, 118")) c = "rgba(22, 163, 74, 0.4)";
            else if (c && c.includes("51, 102")) c = "rgba(220, 38, 38, 0.4)";
          }
          return { time: v.time, value: v.value, color: c || "#94a3b8" };
        })
      );
      volumeSeries.setData(themedVol);
    }
  } catch (err) {
    console.warn("Could not apply chart theme options:", err);
  }
}

function initTheme() {
  const theme = getCurrentTheme();
  applyTheme(theme, false);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const cur = getCurrentTheme();
      const next = cur === "dark" ? "light" : "dark";
      applyTheme(next, true);
    });
  }

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      try {
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
          applyTheme(e.matches ? "dark" : "light", true);
        }
      } catch (err) {}
    });
  }
}

// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================
function setStatus(state, text) {
  statusDot.className = "pulse-dot" + (state === "live" ? " live" : state === "error" ? " error" : "");
  statusText.textContent = text;
}

function fmtINR(val) {
  if (val === undefined || val === null || isNaN(val)) return "₹--";
  return "₹" + Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n === undefined || n === null || isNaN(n)) return "0.00%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n).toFixed(2)}%`;
}

function fmtNum(n) {
  if (!n) return "--";
  if (n >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(2) + " L";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " K";
  return n.toLocaleString("en-IN");
}

function dirClass(n) {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "neutral";
}

function recDirClass(rec) {
  if (rec === "BUY") return "up";
  if (rec === "SELL") return "down";
  return "neutral";
}

// Data Sanitizer (Guarantees ascending order & no duplicates for Lightweight Charts)
function sanitizeData(arr) {
  if (!arr || !Array.isArray(arr) || !arr.length) return [];
  const map = new Map();
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item && item.time !== undefined && item.time !== null) {
      map.set(item.time, item);
    }
  }
  const clean = Array.from(map.values());
  clean.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));
  return clean;
}

// Series Creator (Universal compatibility for Lightweight Charts v4 and v5)
function createSeries(chart, type, options = {}) {
  const LC = window.LightweightCharts;
  if (!chart || !LC) {
    console.error("Chart or LightweightCharts not found when creating series", type);
    return null;
  }

  // 1. Candlestick
  if (type === "Candlestick") {
    if (typeof chart.addCandlestickSeries === "function") return chart.addCandlestickSeries(options);
    if (LC.CandlestickSeries) return chart.addSeries(LC.CandlestickSeries, options);
  }

  // 2. Area
  if (type === "Area") {
    if (typeof chart.addAreaSeries === "function") return chart.addAreaSeries(options);
    if (LC.AreaSeries) return chart.addSeries(LC.AreaSeries, options);
  }

  // 3. Line
  if (type === "Line") {
    if (typeof chart.addLineSeries === "function") return chart.addLineSeries(options);
    if (LC.LineSeries) return chart.addSeries(LC.LineSeries, options);
  }

  // 4. Histogram
  if (type === "Histogram") {
    if (typeof chart.addHistogramSeries === "function") return chart.addHistogramSeries(options);
    if (LC.HistogramSeries) return chart.addSeries(LC.HistogramSeries, options);
  }

  console.warn("Could not create series of type:", type);
  return null;
}

function resizeChartToContainer(chart, container) {
  if (!chart || !container) return;

  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width > 0 && height > 0) {
    chart.applyOptions({ width, height });
  }
}

// ==========================================================================
// LIGHTWEIGHT CHARTS INITIALIZATION
// ==========================================================================
function initCharts() {
  const chartContainer = document.getElementById("chartContainer");
  const rsiContainer = document.getElementById("rsiContainer");
  const macdContainer = document.getElementById("macdContainer");

  if (!window.LightweightCharts) {
    console.error("TradingView Lightweight Charts library not found!");
    return;
  }

  const currentTheme = getCurrentTheme();
  const themeOpts = getChartThemeOptions(currentTheme);

  const commonOptions = {
    ...themeOpts,
    rightPriceScale: {
      ...themeOpts.rightPriceScale,
      autoScale: true,
      scaleMargins: { top: 0.1, bottom: 0.2 },
    },
    timeScale: {
      ...themeOpts.timeScale,
      timeVisible: true,
      secondsVisible: false,
    },
  };

  // 1. Create Main Price Chart
  mainChart = LightweightCharts.createChart(chartContainer, {
    ...commonOptions,
    width: chartContainer.clientWidth,
    height: 480,
  });

  // Candlestick Series (Luminous Green & Crimson Red with high contrast)
  candleSeries = createSeries(mainChart, "Candlestick", {
    upColor: "#00E676",
    downColor: "#FF3366",
    borderUpColor: "#00E676",
    borderDownColor: "#FF3366",
    wickUpColor: "#00E676",
    wickDownColor: "#FF3366",
  });

  // Area Series (Smooth glowing light-blue gradient)
  areaSeries = createSeries(mainChart, "Area", {
    topColor: "rgba(56, 189, 248, 0.45)",
    bottomColor: "rgba(56, 189, 248, 0.0)",
    lineColor: "#38bdf8",
    lineWidth: 2,
    visible: false,
  });

  // Volume Histogram Series
  volumeSeries = createSeries(mainChart, "Histogram", {
    priceFormat: { type: "volume" },
    priceScaleId: "",
    scaleMargins: { top: 0.8, bottom: 0 },
  });

  // Moving Averages: SMA 20 (Amber) and SMA 50 (Light Blue)
  sma20Series = createSeries(mainChart, "Line", {
    color: "#FBBF24",
    lineWidth: 2,
    title: "SMA 20",
  });

  sma50Series = createSeries(mainChart, "Line", {
    color: "#38BDF8",
    lineWidth: 2,
    title: "SMA 50",
  });

  // Bollinger Bands
  bbUpperSeries = createSeries(mainChart, "Line", {
    color: "rgba(192, 132, 252, 0.8)",
    lineWidth: 1,
    lineStyle: 2,
    title: "BB Upper",
    visible: false,
  });

  bbLowerSeries = createSeries(mainChart, "Line", {
    color: "rgba(192, 132, 252, 0.8)",
    lineWidth: 1,
    lineStyle: 2,
    title: "BB Lower",
    visible: false,
  });

  // AI Forecast Projection Series
  forecastSeries = createSeries(mainChart, "Line", {
    color: "#00F0FF",
    lineWidth: 2,
    lineStyle: 1, // dotted
    title: "AI Forecast",
  });

  forecastUpperSeries = createSeries(mainChart, "Line", {
    color: "rgba(0, 240, 255, 0.4)",
    lineWidth: 1,
    lineStyle: 2,
    title: "Forecast +Upper",
  });

  forecastLowerSeries = createSeries(mainChart, "Line", {
    color: "rgba(0, 240, 255, 0.4)",
    lineWidth: 1,
    lineStyle: 2,
    title: "Forecast -Lower",
  });

  // 2. Create RSI Sub-Chart
  rsiChart = LightweightCharts.createChart(rsiContainer, {
    ...commonOptions,
    width: chartContainer.clientWidth,
    height: 140,
    rightPriceScale: {
      ...commonOptions.rightPriceScale,
      autoScale: true,
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
  });

  rsiLineSeries = createSeries(rsiChart, "Line", {
    color: "#E879F9",
    lineWidth: 2,
    title: "RSI (14)",
  });

  if (rsiLineSeries && typeof rsiLineSeries.createPriceLine === "function") {
    try {
      rsiLineSeries.createPriceLine({
        price: 70,
        color: "rgba(255, 51, 102, 0.8)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "70 Overbought",
      });
      rsiLineSeries.createPriceLine({
        price: 30,
        color: "rgba(0, 230, 118, 0.8)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "30 Oversold",
      });
    } catch (e) {}
  }

  // 3. Create MACD Sub-Chart
  macdChart = LightweightCharts.createChart(macdContainer, {
    ...commonOptions,
    width: chartContainer.clientWidth,
    height: 140,
  });

  macdLineSeries = createSeries(macdChart, "Line", {
    color: "#00F0FF",
    lineWidth: 2,
    title: "MACD",
  });

  macdSignalSeries = createSeries(macdChart, "Line", {
    color: "#FBBF24",
    lineWidth: 1.5,
    title: "Signal",
  });

  macdHistSeries = createSeries(macdChart, "Histogram", {
    title: "Hist",
  });

  // Crosshair Synchronization & Hover Legend
  mainChart.subscribeCrosshairMove((param) => {
    updateLegend(param);
  });

  // Window Resize Responsive Handler
  window.addEventListener("resize", () => {
    resizeChartToContainer(mainChart, chartContainer);
    resizeChartToContainer(rsiChart, rsiContainer);
    resizeChartToContainer(macdChart, macdContainer);
  });

  // Apply initial theme options and series colors
  updateChartsTheme(getCurrentTheme());
}

// Update Legend on Chart Crosshair Hover
function updateLegend(param) {
  const legDate = document.getElementById("legDate").querySelector(".val");
  const legOpen = document.getElementById("legOpen").querySelector(".val");
  const legHigh = document.getElementById("legHigh").querySelector(".val");
  const legLow = document.getElementById("legLow").querySelector(".val");
  const legClose = document.getElementById("legClose").querySelector(".val");
  const legVol = document.getElementById("legVol").querySelector(".val");
  const legSMA20 = document.getElementById("legSMA20").querySelector(".val");
  const legSMA50 = document.getElementById("legSMA50").querySelector(".val");

  if (!param || !param.time || !param.seriesData) {
    if (currentHistoryData && currentHistoryData.candles.length) {
      const last = currentHistoryData.candles[currentHistoryData.candles.length - 1];
      legDate.textContent = typeof last.time === "number" ? new Date(last.time * 1000).toLocaleDateString("en-IN") : last.time;
      legOpen.textContent = fmtINR(last.open);
      legHigh.textContent = fmtINR(last.high);
      legLow.textContent = fmtINR(last.low);
      legClose.textContent = fmtINR(last.close);
      legVol.textContent = fmtNum(last.volume);
    }
    return;
  }

  const cData = (candleSeries && param.seriesData.get(candleSeries)) || (areaSeries && param.seriesData.get(areaSeries));
  const vData = volumeSeries && param.seriesData.get(volumeSeries);
  const s20 = sma20Series && param.seriesData.get(sma20Series);
  const s50 = sma50Series && param.seriesData.get(sma50Series);

  if (cData) {
    legDate.textContent = typeof param.time === "number" ? new Date(param.time * 1000).toLocaleDateString("en-IN") : param.time;
    if (cData.open !== undefined) {
      legOpen.textContent = fmtINR(cData.open);
      legHigh.textContent = fmtINR(cData.high);
      legLow.textContent = fmtINR(cData.low);
      legClose.textContent = fmtINR(cData.close);
    } else if (cData.value !== undefined) {
      legClose.textContent = fmtINR(cData.value);
    }
  }

  if (vData) legVol.textContent = fmtNum(vData.value);
  if (s20) legSMA20.textContent = fmtINR(s20.value);
  if (s50) legSMA50.textContent = fmtINR(s50.value);
}

// ==========================================================================
// LOAD STOCK HISTORICAL CHART DATA
// ==========================================================================
async function loadStockChart(symbol, period = currentPeriod) {
  currentSymbol = symbol;
  currentPeriod = period;

  const overlay = document.getElementById("chartLoadingOverlay");
  overlay.classList.remove("hidden");

  // Update tabs UI
  quickStockTabs.querySelectorAll(".quick-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.symbol === symbol);
  });
  timeframeGroup.querySelectorAll(".tf-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.period === period);
  });

  // Mark in screener grid
  document.querySelectorAll(".stock-card").forEach((card) => {
    card.classList.toggle("active-chart-stock", card.dataset.symbol === symbol);
  });

  try {
    const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(symbol)}?period=${period}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentHistoryData = data;

    renderChartData(data);
    updateStockHeaderAndStats(data);
  } catch (err) {
    console.error("Failed to load stock history:", err);
  } finally {
    overlay.classList.add("hidden");
  }
}

// Render data onto Lightweight Charts
function renderChartData(data) {
  if (!mainChart) return;

  const isLight = getCurrentTheme() === "light";
  const volume = sanitizeData(
    (data.volume || []).map((v) => {
      let c = v.color;
      if (isLight) {
        if (c && c.includes("230, 118")) c = "rgba(22, 163, 74, 0.4)";
        else if (c && c.includes("51, 102")) c = "rgba(220, 38, 38, 0.4)";
      }
      return { time: v.time, value: v.value, color: c || "#94a3b8" };
    })
  );
  const sma20 = sanitizeData(data.sma20 || []);
  const sma50 = sanitizeData(data.sma50 || []);
  const bollinger = data.bollinger || { upper: [], lower: [] };
  const bbUpper = sanitizeData(bollinger.upper || []);
  const bbLower = sanitizeData(bollinger.lower || []);
  const rsi = sanitizeData(data.rsi || []);
  const macd = sanitizeData(data.macd || []);
  const forecast = sanitizeData(data.forecast || []);
  const candles = sanitizeData(data.candles || []);

  // 1. Candlestick & Area Data
  if (candleSeries) candleSeries.setData(candles);

  const areaData = candles.map((c) => ({
    time: c.time,
    value: c.close,
  }));
  if (areaSeries) areaSeries.setData(areaData);

  // Toggle visible series based on chart type
  if (currentChartType === "candles") {
    if (candleSeries) candleSeries.applyOptions({ visible: true });
    if (areaSeries) areaSeries.applyOptions({ visible: false });
  } else {
    if (candleSeries) candleSeries.applyOptions({ visible: false });
    if (areaSeries) areaSeries.applyOptions({ visible: true });
  }

  // 2. Volume
  if (volumeSeries) volumeSeries.setData(volume);

  // 3. Moving Averages
  if (sma20Series) {
    sma20Series.setData(sma20);
    sma20Series.applyOptions({ visible: indicatorsState.sma20 });
  }

  if (sma50Series) {
    sma50Series.setData(sma50);
    sma50Series.applyOptions({ visible: indicatorsState.sma50 });
  }

  // 4. Bollinger Bands
  if (bbUpperSeries) {
    bbUpperSeries.setData(bbUpper);
    bbUpperSeries.applyOptions({ visible: indicatorsState.bb });
  }
  if (bbLowerSeries) {
    bbLowerSeries.setData(bbLower);
    bbLowerSeries.applyOptions({ visible: indicatorsState.bb });
  }

  // 5. AI Forecast Projection
  if (forecastSeries && forecastUpperSeries && forecastLowerSeries) {
    if (indicatorsState.forecast && forecast.length) {
      forecastSeries.setData(forecast.map((f) => ({ time: f.time, value: f.value })));
      forecastUpperSeries.setData(forecast.map((f) => ({ time: f.time, value: f.upper })));
      forecastLowerSeries.setData(forecast.map((f) => ({ time: f.time, value: f.lower })));
      forecastSeries.applyOptions({ visible: true });
      forecastUpperSeries.applyOptions({ visible: true });
      forecastLowerSeries.applyOptions({ visible: true });
    } else {
      forecastSeries.applyOptions({ visible: false });
      forecastUpperSeries.applyOptions({ visible: false });
      forecastLowerSeries.applyOptions({ visible: false });
    }
  }

  // 6. Sub-charts (RSI & MACD)
  const rsiContainer = document.getElementById("rsiContainer");
  const macdContainer = document.getElementById("macdContainer");

  if (indicatorsState.rsi) {
    rsiContainer.classList.remove("hidden");
    if (rsiLineSeries) rsiLineSeries.setData(rsi);
    if (rsiChart) {
      resizeChartToContainer(rsiChart, rsiContainer);
      rsiChart.timeScale().fitContent();
    }
  } else {
    rsiContainer.classList.add("hidden");
  }

  if (indicatorsState.macd) {
    macdContainer.classList.remove("hidden");
    if (macdLineSeries) macdLineSeries.setData(macd.map((m) => ({ time: m.time, value: m.macd })));
    if (macdSignalSeries) macdSignalSeries.setData(macd.map((m) => ({ time: m.time, value: m.signal })));
    if (macdHistSeries) {
      macdHistSeries.setData(
        macd.map((m) => ({
          time: m.time,
          value: m.hist,
          color: m.histColor,
        }))
      );
    }
    if (macdChart) {
      resizeChartToContainer(macdChart, macdContainer);
      macdChart.timeScale().fitContent();
    }
  } else {
    macdContainer.classList.add("hidden");
  }

  // Fit content cleanly
  mainChart.timeScale().fitContent();
  updateLegend();
}

// Update Active Stock Information and Bottom Stats
function updateStockHeaderAndStats(data) {
  const stats = data.stats || {};
  const pred = data.prediction || {};

  document.getElementById("chartStockName").textContent = data.company || data.symbol;
  document.getElementById("chartStockSymbol").textContent = data.symbol;
  document.getElementById("chartPrice").textContent = fmtINR(stats.price);

  const chgEl = document.getElementById("chartChange");
  const chgClass = dirClass(stats.day_change);
  chgEl.className = `change-hero ${chgClass}`;
  chgEl.textContent = `${stats.day_change >= 0 ? "+" : ""}${fmtINR(stats.day_change)} (${fmtPct(stats.day_change_pct)})`;

  document.getElementById("chartDayRange").textContent = `Day: ${fmtINR(stats.day_low)} - ${fmtINR(stats.day_high)}`;

  // AI Signal Badge
  const signalTextEl = document.getElementById("chartSignalText");
  const confTextEl = document.getElementById("chartConfidenceText");
  const rec = pred.recommendation || "HOLD";
  const conf = pred.confidence || 60;

  signalTextEl.className = `ai-signal-val ${rec}`;
  signalTextEl.textContent = rec;
  confTextEl.textContent = `Confidence: ${conf}% · XGBoost (${((pred.technical_score || 0.5) * 100).toFixed(0)}%) + News Sentiment`;

  // AI Target & Trade Setup Strip
  const targetStrip = document.getElementById("chartTargetSetupStrip");
  if (targetStrip) {
    if (pred.target_price && pred.stop_loss) {
      const expRoi = pred.expected_roi || 0;
      const roiText = typeof expRoi === "string" ? expRoi : fmtPct(expRoi);
      const isDown = String(expRoi).startsWith("-");
      const isHold = String(expRoi).includes("Range") || String(expRoi).includes("Hold");
      const targetPillClass = isDown ? "target-down" : isHold ? "target-hold" : "target-up";
      targetStrip.innerHTML = `
        <span class="setup-pill ${targetPillClass}" title="30-Day Target Price Projection">
          <span>Target:</span>
          <strong>${fmtINR(pred.target_price)} (${roiText})</strong>
        </span>
        <span class="setup-pill sl" title="Protective Stop Loss Level">
          <span>SL:</span>
          <strong>${fmtINR(pred.stop_loss)}</strong>
        </span>
        <span class="setup-pill rr" title="Risk-to-Reward Ratio">
          <span>R:R:</span>
          <strong>${pred.risk_reward || "1 : 2.0"}</strong>
        </span>
        <span class="setup-pill" title="Signal Strength Rating">
          <span>Rating:</span>
          <strong>${pred.signal_strength || rec}</strong>
        </span>
      `;
    } else {
      targetStrip.innerHTML = "";
    }
  }

  // 52-Week Range Slider
  const low52 = stats.low_52w || 0;
  const high52 = stats.high_52w || 1;
  const cur = stats.price || low52;
  document.getElementById("stat52Low").textContent = fmtINR(low52);
  document.getElementById("stat52High").textContent = fmtINR(high52);

  const pct52 = high52 > low52 ? Math.max(0, Math.min(100, ((cur - low52) / (high52 - low52)) * 100)) : 50;
  document.getElementById("meter52Pin").style.left = `${pct52}%`;
  document.getElementById("meter52Fill").style.width = `${pct52}%`;

  // Stats boxes
  document.getElementById("statDayRange").textContent = `${fmtINR(stats.day_low)} - ${fmtINR(stats.day_high)}`;
  document.getElementById("statAvgVol").textContent = fmtNum(stats.avg_volume);
  document.getElementById("statVolat").textContent = `${stats.volatility || 0}%`;
  document.getElementById("statRSI").textContent = stats.rsi || "--";
  document.getElementById("statTechScore").textContent = pred.technical_score ? `${(pred.technical_score * 100).toFixed(1)}%` : "--";
  document.getElementById("statSentScore").textContent = pred.sentiment_label ? `${pred.sentiment_label} (${pred.sentiment_score || 0.5})` : "--";

  // AI Rationale Tags
  const rationaleContainer = document.getElementById("rationaleTags");
  const reasons = pred.explanation || ["Technical momentum and moving average alignment analyzed."];
  rationaleContainer.innerHTML = reasons.map((r) => `<span class="tag">${r}</span>`).join("");
}

// ==========================================================================
// LOAD INDIAN BENCHMARK INDICES
// ==========================================================================
async function loadIndices() {
  try {
    const res = await fetch(`${API_BASE}/api/indices`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    marketIndices = data.indices || [];
    renderIndices(marketIndices);
  } catch (err) {
    console.warn("Could not load indices:", err);
  }
}

function renderIndices(indices) {
  if (!indices || !indices.length) return;

  indicesContainer.innerHTML = indices
    .map((idx) => {
      const chgClass = dirClass(idx.change);
      const isAct = idx.symbol === currentSymbol;

      // Render mini SVG sparkline
      const spark = idx.sparkline || [];
      let sparkSvg = "";
      if (spark.length >= 2) {
        const min = Math.min(...spark);
        const max = Math.max(...spark);
        const range = max > min ? max - min : 1;
        const pts = spark
          .map((v, i) => {
            const x = (i / (spark.length - 1)) * 60;
            const y = 26 - ((v - min) / range) * 22;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
        const strokeColor = idx.change >= 0 ? "var(--up)" : "var(--down)";
        sparkSvg = `<svg class="index-sparkline" viewBox="0 0 60 28" aria-hidden="true">
          <polyline fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${pts}" />
        </svg>`;
      }

      return `
      <div class="index-chip ${isAct ? "active" : ""}" data-symbol="${idx.symbol}">
        <div class="index-chip-info">
          <span class="index-chip-name">${idx.name}</span>
          <span class="index-chip-price">${Number(idx.price).toLocaleString("en-IN")}</span>
          <span class="index-chip-chg ${chgClass}">
            ${idx.change >= 0 ? "▲" : "▼"} ${fmtPct(idx.change_pct)}
          </span>
        </div>
        ${sparkSvg}
      </div>`;
    })
    .join("");

  indicesContainer.querySelectorAll(".index-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      loadStockChart(chip.dataset.symbol);
    });
  });
}

// ==========================================================================
// LOAD PREDICTIONS & SCREENER GRID
// ==========================================================================
async function loadPredictions() {
  setStatus("connecting", "Evaluating XGBoost & FinBERT models…");

  // Render Skeletons
  grid.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const card = document.createElement("div");
    card.className = "stock-card skeleton";
    card.style.height = "160px";
    grid.appendChild(card);
  }

  try {
    const res = await fetch(`${API_BASE}/api/predict-all`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allPredictions = data.results || [];
    setStatus("live", `Live · ${allPredictions.length} NSE Stocks Analyzed`);

    renderTicker(allPredictions);
    renderGrid();
  } catch (err) {
    setStatus("error", "Backend offline — Is FastAPI running on :8000?");
    grid.innerHTML = `
      <div style="grid-column: 1/-1; background: rgba(255,51,102,0.15); border: 1px solid rgba(255,51,102,0.4); padding: 24px; border-radius: 14px; text-align: center;">
        <h3 style="color:var(--down); margin-bottom: 8px;">Backend API Unreachable</h3>
        <p style="color:var(--text-main); font-size: 13px;">
          Make sure the FastAPI server is running with <code>uvicorn main:app --reload --port 8000</code>.
        </p>
      </div>`;
  }
}

// Ticker Ribbon Marquee
function renderTicker(results) {
  if (!results.length) return;
  const items = results
    .map(
      (r) => `
      <span class="ticker-item" data-symbol="${r.stock}">
        <span class="sym">${r.stock.replace(".NS", "")}</span>
        <span class="chg ${dirClass(r.day_change_pct)}">${fmtPct(r.day_change_pct)}</span>
        <span class="pill badge ${r.recommendation}">${r.recommendation}</span>
      </span>`
    )
    .join("");

  // Duplicate for infinite marquee loop
  tickerTrack.innerHTML = items + items;

  tickerTrack.querySelectorAll(".ticker-item").forEach((item) => {
    item.addEventListener("click", () => {
      loadStockChart(item.dataset.symbol);
      window.scrollTo({ top: 100, behavior: "smooth" });
    });
  });
}

// Render Screener Grid
function renderGrid() {
  const query = searchBox.value.trim().toLowerCase();

  let filtered = allPredictions.filter((r) => {
    const matchesQuery =
      !query ||
      r.stock.toLowerCase().includes(query) ||
      r.company.toLowerCase().includes(query);

    let matchesFilter = true;
    if (activeFilter === "BUY") matchesFilter = r.recommendation === "BUY";
    else if (activeFilter === "SELL") matchesFilter = r.recommendation === "SELL";
    else if (activeFilter === "HOLD") matchesFilter = r.recommendation === "HOLD";
    else if (activeFilter === "GAINERS") matchesFilter = r.day_change_pct > 0;
    else if (activeFilter === "LOSERS") matchesFilter = r.day_change_pct < 0;

    return matchesQuery && matchesFilter;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (activeSort === "conf_desc") return b.confidence - a.confidence;
    if (activeSort === "change_desc") return b.day_change_pct - a.day_change_pct;
    if (activeSort === "change_asc") return a.day_change_pct - b.day_change_pct;
    if (activeSort === "price_desc") return b.price - a.price;
    if (activeSort === "name_asc") return a.company.localeCompare(b.company);
    return 0;
  });

  if (!filtered.length) {
    grid.innerHTML = `<p style="grid-column: 1/-1; color: var(--text-muted); text-align: center; padding: 40px;">No stocks match your search or filter.</p>`;
    return;
  }

  grid.innerHTML = filtered
    .map((r) => {
      const dClass = dirClass(r.day_change_pct);
      const isAct = r.stock === currentSymbol;
      const dialColor =
        r.recommendation === "BUY" ? "var(--up)" : r.recommendation === "SELL" ? "var(--down)" : "var(--hold)";

      const expRoi = r.expected_roi || 0;
      const roiText = typeof expRoi === "string" ? expRoi : fmtPct(expRoi);
      const isDown = String(expRoi).startsWith("-");
      const isHold = String(expRoi).includes("Range") || String(expRoi).includes("Hold");
      const targetClass = isDown ? "down" : isHold ? "hold" : "up";

      return `
      <article class="stock-card ${isAct ? "active-chart-stock" : ""}" data-symbol="${r.stock}">
        <div class="card-top">
          <div>
            <div class="card-sym">${r.stock.replace(".NS", "")}</div>
            <div class="card-name" title="${r.company}">${r.company}</div>
          </div>
          <span class="badge ${r.recommendation}">${r.signal_strength || r.recommendation}</span>
        </div>

        <div class="card-mid">
          <div>
            <div class="card-price">${fmtINR(r.price)}</div>
            <div class="card-chg ${dClass}">${fmtPct(r.day_change_pct)} today</div>
          </div>
          <div class="dial" style="--pct:${r.confidence}; --dial-color:${dialColor};">
            <span>${r.confidence}%</span>
          </div>
        </div>

        ${r.target_price ? `
        <div class="card-trade-box">
          <div>
            <span class="card-target-lbl">Target: </span>
            <span class="card-target-val ${targetClass}">${fmtINR(r.target_price)} (${roiText})</span>
          </div>
          <div>
            <span class="card-target-lbl">SL: </span>
            <span class="card-sl-val">${fmtINR(r.stop_loss)}</span>
          </div>
        </div>
        ` : ""}

        <div class="card-bottom">
          <span>RSI ${r.rsi !== undefined ? r.rsi : "--"}</span>
          <span>News: ${r.sentiment_label || "Neutral"}</span>
          <span>Score ${r.final_score !== undefined ? (r.final_score * 100).toFixed(0) : "--"}</span>
        </div>

        <div class="card-actions">
          <button class="card-btn primary btn-chart" data-symbol="${r.stock}">
            <svg class="card-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
              <polyline points="16 7 22 7 22 13"></polyline>
            </svg>
            <span>View Graph</span>
          </button>
          <button class="card-btn btn-details" data-symbol="${r.stock}">
            <svg class="card-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path>
            </svg>
            <span>AI Insights</span>
          </button>
        </div>
      </article>`;
    })
    .join("");

  // Attach card event listeners
  grid.querySelectorAll(".stock-card").forEach((card) => {
    const sym = card.dataset.symbol;

    card.addEventListener("click", (e) => {
      if (e.target.closest(".btn-details")) {
        openModal(sym);
      } else {
        loadStockChart(sym);
        window.scrollTo({ top: 100, behavior: "smooth" });
      }
    });
  });
}

// ==========================================================================
// MODAL DIALOG (Modern HTML5 closedby="any" with cross-browser fallback)
// ==========================================================================
async function openModal(symbol) {
  const r = allPredictions.find((x) => x.stock === symbol);
  if (!r) return;

  modalStockTitle.textContent = `${r.company} (${r.stock.replace(".NS", "")})`;
  modalStockSub.textContent = `As of ${r.as_of} · Recommendation: ${r.recommendation} (${r.confidence}% confidence)`;

  const explanationHtml = (r.explanation || [])
    .map((line) => `<li style="margin-bottom:6px;">${line}</li>`)
    .join("");

  modalBody.innerHTML = `
    <div class="dialog-scores-grid">
      <div class="dialog-score-item">
        <span class="dialog-score-lbl">Technical (XGBoost)</span>
        <span class="dialog-score-val" style="color:var(--text-sub);">${((r.technical_score || 0.5) * 100).toFixed(1)}%</span>
        <span style="font-size:11px; color:var(--text-muted);">80% Weight</span>
      </div>
      <div class="dialog-score-item">
        <span class="dialog-score-lbl">Sentiment (${r.sentiment_label})</span>
        <span class="dialog-score-val" style="color:var(--orange);">${((r.sentiment_score || 0.5) * 100).toFixed(1)}%</span>
        <span style="font-size:11px; color:var(--text-muted);">20% Weight · ${r.headlines_used} headlines</span>
      </div>
      <div class="dialog-score-item">
        <span class="dialog-score-lbl">Combined AI Signal</span>
        <span class="dialog-score-val badge ${r.recommendation}" style="font-size:14px; align-self:flex-start;">${r.signal_strength || r.recommendation}</span>
        <span style="font-size:11px; color:var(--text-muted);">${r.confidence}% Confidence</span>
      </div>
    </div>

    ${r.target_price ? `
    <div style="background:var(--bg-glass); border:1px solid var(--border-glass); border-radius:var(--radius-md); padding:12px 14px; margin-bottom:12px;">
      <div style="font-size:11px; font-weight:700; color:var(--text-sub); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
        30-Day AI Trade Setup &amp; Price Targets
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:10px; font-family:var(--font-mono);">
        <div style="background:var(--bg-glass-elevated); padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-glass-light);">
          <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Target Price (30D)</div>
          <div style="font-size:13.5px; font-weight:700; margin-top:2px;" class="${String(r.expected_roi).startsWith('-') ? 'card-target-val down' : String(r.expected_roi).includes('Range') || String(r.expected_roi).includes('Hold') ? 'card-target-val hold' : 'card-target-val up'}">
            ${fmtINR(r.target_price)} (${typeof r.expected_roi === 'string' ? r.expected_roi : fmtPct(r.expected_roi)})
          </div>
        </div>
        <div style="background:var(--bg-glass-elevated); padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-glass-light);">
          <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Stop-Loss</div>
          <div style="font-size:13.5px; font-weight:700; color:var(--text-main); margin-top:2px;">
            ${fmtINR(r.stop_loss)}
          </div>
        </div>
        <div style="background:var(--bg-glass-elevated); padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-glass-light);">
          <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Risk-to-Reward</div>
          <div style="font-size:13.5px; font-weight:700; color:var(--light-blue); margin-top:2px;">
            ${r.risk_reward || "1 : 2.0"}
          </div>
        </div>
        <div style="background:var(--bg-glass-elevated); padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-glass-light);">
          <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Signal Strength</div>
          <div style="font-size:13.5px; font-weight:700; color:var(--cyan-neon); margin-top:2px;">
            ${r.signal_strength || r.recommendation}
          </div>
        </div>
      </div>
    </div>` : ""}

    <div>
      <h3 style="font-size:14px; margin-bottom:8px; color:var(--text-sub);">Model Key Rationale:</h3>
      <ul style="padding-left:18px; font-size:13px; color:var(--text-main); line-height:1.6;">
        ${explanationHtml}
      </ul>
    </div>

    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h3 style="font-size:14px; color:var(--text-main);">Recent News &amp; Sentiment:</h3>
        <button id="modalChartBtn" class="action-btn" style="padding:6px 14px; font-size:12px;">
          <svg class="card-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
            <polyline points="16 7 22 7 22 13"></polyline>
          </svg>
          <span>Open in Interactive Graph</span>
        </button>
      </div>
      <div id="modalNewsList" class="news-list">
        <div style="color:var(--text-muted); font-size:13px;">Fetching latest headlines from NSE/Yahoo Finance…</div>
      </div>
    </div>
  `;

  // Attach Open in Chart button inside modal
  document.getElementById("modalChartBtn").addEventListener("click", () => {
    modal.close();
    loadStockChart(symbol);
    window.scrollTo({ top: 100, behavior: "smooth" });
  });

  // Open modal using modern showModal
  modal.showModal();

  // Load news articles
  try {
    const res = await fetch(`${API_BASE}/api/news/${encodeURIComponent(symbol)}`);
    const data = await res.json();
    const newsEl = document.getElementById("modalNewsList");
    if (!data.articles || !data.articles.length) {
      newsEl.innerHTML = `<p style="color:var(--text-muted); font-size:13px;">No recent headlines found for ${r.company}.</p>`;
      return;
    }

    newsEl.innerHTML = data.articles
      .map(
        (a) => `
        <div class="news-card">
          <span class="news-card-title">${a.title}</span>
          <span class="news-card-meta ${a.label}">${a.label} (${a.score})</span>
        </div>`
      )
      .join("");
  } catch (e) {
    document.getElementById("modalNewsList").innerHTML = `<p style="color:var(--text-muted); font-size:13px;">Could not fetch news headlines.</p>`;
  }
}

// Modal Light Dismiss Fallback (compliant with modern-web-guidance)
if (!("closedBy" in HTMLDialogElement.prototype)) {
  modal.addEventListener("click", (event) => {
    if (event.target !== modal) return;
    const rect = modal.getBoundingClientRect();
    const isInside =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!isInside) modal.close();
  });
}

modalCloseBtn.addEventListener("click", () => modal.close());

// ==========================================================================
// QUICK SEARCH AUTOCOMPLETE
// ==========================================================================
async function loadStocksList() {
  try {
    const res = await fetch(`${API_BASE}/api/stocks`);
    const data = await res.json();
    allStocksList = [...(data.indices || []), ...(data.stocks || [])];
  } catch (e) {
    console.warn("Could not load stocks list:", e);
  }
}

quickSearchInput.addEventListener("input", () => {
  const q = quickSearchInput.value.trim().toLowerCase();
  if (!q) {
    quickSearchResults.classList.add("hidden");
    return;
  }

  const matches = allStocksList.filter(
    (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  );

  if (!matches.length) {
    quickSearchResults.innerHTML = `<div style="padding:10px 14px; color:var(--text-muted); font-size:12px;">No matching symbol</div>`;
    quickSearchResults.classList.remove("hidden");
    return;
  }

  quickSearchResults.innerHTML = matches
    .slice(0, 7)
    .map(
      (m) => `
      <div class="search-item" data-symbol="${m.symbol}">
        <span class="sym">${m.symbol}</span>
        <span class="name">${m.name}</span>
      </div>`
    )
    .join("");

  quickSearchResults.classList.remove("hidden");

  quickSearchResults.querySelectorAll(".search-item").forEach((item) => {
    item.addEventListener("click", () => {
      loadStockChart(item.dataset.symbol);
      quickSearchInput.value = "";
      quickSearchResults.classList.add("hidden");
      window.scrollTo({ top: 100, behavior: "smooth" });
    });
  });
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".quick-search-wrapper")) {
    quickSearchResults.classList.add("hidden");
  }
});

quickSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const val = quickSearchInput.value.trim();
    if (val) {
      loadStockChart(val);
      quickSearchInput.value = "";
      quickSearchResults.classList.add("hidden");
    }
  }
});

// ==========================================================================
// CONTROLS & LISTENERS
// ==========================================================================
// Quick Tabs (NIFTY, SENSEX, RELIANCE, TCS...)
quickStockTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".quick-tab");
  if (!btn) return;
  loadStockChart(btn.dataset.symbol);
});

// Timeframe buttons (1D, 5D, 1M, 3M, 6M, 1Y, 5Y)
timeframeGroup.addEventListener("click", (e) => {
  const btn = e.target.closest(".tf-btn");
  if (!btn) return;
  loadStockChart(currentSymbol, btn.dataset.period);
});

// Chart Type (Candles vs Area)
document.getElementById("btnCandles").addEventListener("click", () => {
  currentChartType = "candles";
  document.getElementById("btnCandles").classList.add("active");
  document.getElementById("btnArea").classList.remove("active");
  if (candleSeries) candleSeries.applyOptions({ visible: true });
  if (areaSeries) areaSeries.applyOptions({ visible: false });
});

document.getElementById("btnArea").addEventListener("click", () => {
  currentChartType = "area";
  document.getElementById("btnArea").classList.add("active");
  document.getElementById("btnCandles").classList.remove("active");
  if (candleSeries) candleSeries.applyOptions({ visible: false });
  if (areaSeries) areaSeries.applyOptions({ visible: true });
});

// Indicator Toggle Buttons
document.querySelectorAll(".ind-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ind = btn.dataset.ind;
    indicatorsState[ind] = !indicatorsState[ind];
    btn.classList.toggle("active", indicatorsState[ind]);

    if (currentHistoryData) {
      renderChartData(currentHistoryData);
    }
  });
});

// Fullscreen Toggle
document.getElementById("btnFullscreen").addEventListener("click", () => {
  const hero = document.getElementById("chartHero");
  if (!document.fullscreenElement) {
    hero.requestFullscreen().catch((err) => console.log(err));
  } else {
    document.exitFullscreen();
  }
});

// Screener Search & Filters
searchBox.addEventListener("input", renderGrid);

filterButtons.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-pill");
  if (!btn) return;
  filterButtons.querySelectorAll(".filter-pill").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  activeFilter = btn.dataset.filter;
  renderGrid();
});

sortSelect.addEventListener("change", (e) => {
  activeSort = e.target.value;
  renderGrid();
});

// Refresh button with smooth spin state
globalRefreshBtn.addEventListener("click", async () => {
  globalRefreshBtn.classList.add("is-refreshing");
  try {
    await Promise.allSettled([
      loadIndices(),
      loadPredictions(),
      loadStockChart(currentSymbol, currentPeriod),
    ]);
  } finally {
    setTimeout(() => {
      globalRefreshBtn.classList.remove("is-refreshing");
    }, 600);
  }
});

// ==========================================================================
// BACKGROUND VIDEO CONTROLLER (SEAMLESS CROSS-FADE & AUTOPLAY RECOVERY)
// ==========================================================================
function initBackgroundVideo() {
  const A = document.getElementById("bgVideoA");
  const B = document.getElementById("bgVideoB");
  if (!A || !B) return;

  function attemptPlay(v) {
    if (!v) return;
    if (getCurrentTheme() === "light") return;
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        const unlock = () => {
          if (getCurrentTheme() !== "light") {
            v.play();
          }
          window.removeEventListener("click", unlock);
          window.removeEventListener("touchstart", unlock);
          window.removeEventListener("keydown", unlock);
        };
        window.addEventListener("click", unlock, { once: true });
        window.addEventListener("touchstart", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
      });
    }
  }

  if (getCurrentTheme() !== "light") {
    attemptPlay(A);
  }

  const FADE = 0.9;
  let cur = A;
  let nxt = B;
  let swapping = false;

  function tick() {
    if (getCurrentTheme() === "light") return;
    if (swapping || !cur.duration) return;
    if (cur.duration - cur.currentTime > FADE) return;

    swapping = true;
    const out = cur;
    nxt.currentTime = 0;
    attemptPlay(nxt);
    nxt.classList.add("is-active");
    out.classList.remove("is-active");

    const tmp = cur;
    cur = nxt;
    nxt = tmp;

    setTimeout(() => {
      out.pause();
      try { out.currentTime = 0; } catch (e) {}
      swapping = false;
    }, FADE * 1000 + 100);
  }

  A.addEventListener("timeupdate", tick);
  B.addEventListener("timeupdate", tick);
}

// ==========================================================================
// APP INITIALIZATION
// ==========================================================================
window.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initBackgroundVideo();
  initCharts();
  await loadStocksList();
  loadIndices();
  loadPredictions();
  loadStockChart(currentSymbol, currentPeriod);

  // Auto-refresh every 3 minutes
  setInterval(() => {
    loadIndices();
    loadPredictions();
  }, 3 * 60 * 1000);
});
