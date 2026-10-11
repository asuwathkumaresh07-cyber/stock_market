"""
stocks.py
---------
Registry of National Stock Exchange of India (NSE) symbols and indices.
Exclusively tracks pure NSE India symbols (all ending in .NS) with NO BSE stocks.
"""

STOCKS = {
    "RELIANCE.NS": "Reliance Industries",
    "TCS.NS": "Tata Consultancy Services",
    "HDFCBANK.NS": "HDFC Bank",
    "ICICIBANK.NS": "ICICI Bank",
    "INFY.NS": "Infosys",
    "HINDUNILVR.NS": "Hindustan Unilever",
    "ITC.NS": "ITC Limited",
    "SBIN.NS": "State Bank of India",
    "BHARTIARTL.NS": "Bharti Airtel",
    "KOTAKBANK.NS": "Kotak Mahindra Bank",
    "LT.NS": "Larsen & Toubro",
    "AXISBANK.NS": "Axis Bank",
    "BAJFINANCE.NS": "Bajaj Finance",
    "MARUTI.NS": "Maruti Suzuki",
    "SUNPHARMA.NS": "Sun Pharmaceutical",
    "TITAN.NS": "Titan Company",
    "ASIANPAINT.NS": "Asian Paints",
    "WIPRO.NS": "Wipro",
    "ADANIENT.NS": "Adani Enterprises",
    "TATAMOTORS.NS": "Tata Motors",
}

# Pure NSE Indices (NO BSE / SENSEX)
INDICES = {
    "^NSEI": "NIFTY 50",
    "^NSEBANK": "BANK NIFTY",
    "^CNXIT": "NIFTY IT",
    "^CNX100": "NIFTY 100",
}

def get_display_name(symbol: str) -> str:
    sym = symbol.upper()
    if sym in INDICES:
        return INDICES[sym]
    if sym in STOCKS:
        return STOCKS[sym]
    if not sym.endswith(".NS") and not sym.startswith("^"):
        sym_ns = f"{sym}.NS"
        if sym_ns in STOCKS:
            return STOCKS[sym_ns]
    return sym.replace(".NS", "")
