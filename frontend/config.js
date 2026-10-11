window.API_BASE =
  window.location.port === "5500"
    ? "http://localhost:8000"
    : window.location.origin;
