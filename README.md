📈 Stock Market Prediction & Live Analytics

An AI-powered stock market analysis platform designed to explore market trends, visualize stock performance, and generate predictions using machine learning. The project combines a FastAPI backend with a web-based frontend to provide an interactive experience for stock market analysis.

✨ Features

- Stock Market Analysis — Retrieve stock information and analyze market trends.
- AI-Based Predictions — Generate stock price predictions using the project's trained machine learning model.
- Interactive Dashboard — View stock data and predictions through a web interface.
- FastAPI Backend — Expose prediction and stock-data functionality through REST APIs.
- 3D Market Visualization — Add an animated 3D market globe with interactive rotation, zooming, animated market nodes, and glowing connections.
- Modular Architecture — Keep the backend, frontend, prediction logic, and visualization organized separately.
- Deployment Support — Includes configuration for deployment using Render.

«Important: Live market prices and prediction accuracy depend on the data source, model, and configuration. Predictions are estimates, not guaranteed future prices.»

🖥️ Technology Stack

Component| Technology
Backend| Python, FastAPI
API Server| Uvicorn
Frontend| HTML, CSS, JavaScript
3D Graphics| Three.js, WebGL
Machine Learning| Project's configured prediction model
Deployment| Render
Version Control| Git and GitHub

📁 Project Structure

stock_market/
├── backend/
│   ├── main.py
│   ├── predictor.py
│   ├── stocks.py
│   ├── requirements.txt
│   └── requirements-deploy.txt
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── docs/
│   └── market-globe.html
├── render.yaml
├── README.md
└── model files

Note: The exact model filenames and additional files may vary depending on your repository.

⚙️ Installation and Setup

1. Clone the repository

git clone https://github.com/asuwathkumaresh07-cyber/stock_market.git
cd stock_market

2. Create a Python virtual environment

Windows PowerShell:

python -m venv .venv
.\.venv\Scripts\Activate.ps1

If PowerShell blocks activation, use:

.\.venv\Scripts\python.exe -m pip install --upgrade pip

Linux / macOS:

python3 -m venv .venv
source .venv/bin/activate

3. Install dependencies

python -m pip install --upgrade pip
pip install -r backend/requirements.txt

If you are preparing the deployment environment, review "backend/requirements-deploy.txt" and "render.yaml" for the intended deployment configuration.

4. Start the backend

From the repository root:

uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

If your Python package configuration requires running the application from inside the "backend" directory instead, use:

cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000

Open the API documentation:

- API: http://127.0.0.1:8000
- Interactive API documentation: http://127.0.0.1:8000/docs

5. Run the frontend

Open "frontend/index.html" in your browser if the application supports direct file access.

For a local development server, open another terminal from the repository root and run:

python -m http.server 5500 --directory frontend

Then visit:

http://127.0.0.1:5500

Make sure the frontend API URL matches the address where the backend is running. If the browser reports CORS errors, configure the backend's CORS middleware for your local frontend origin.

🌐 Interactive 3D Market Globe

The project can include a standalone 3D visualization at:

"docs/market-globe.html"

Visualization capabilities

- Interactive 3D globe with animated market nodes.
- Mouse-drag rotation and scroll-wheel zoom.
- Animated orbital rings, stars, and connecting lines.
- Dark futuristic interface with glowing visual elements.
- Pause, resume, and reset controls.
- Optional integration with the backend market-index endpoint.

The visualization uses Three.js and WebGL. An internet connection may be required to load Three.js from a CDN.

Run the 3D visualization locally

From the repository root:

python -m http.server 5500

Open:

http://127.0.0.1:5500/docs/market-globe.html

Publish the 3D visualization with GitHub Pages

1. Commit "docs/market-globe.html" to the repository.
2. Open the repository's Settings → Pages.
3. Select Deploy from a branch.
4. Choose the "main" branch and "/docs" folder.
5. Save and wait for GitHub Pages to publish the site.

Your visualization should then be available at:

"https://asuwathkumaresh07-cyber.github.io/stock_market/market-globe.html"

The URL will work only after the file is committed and GitHub Pages is enabled.

Note: GitHub README files cannot directly execute interactive WebGL applications. Link to the hosted visualization from the README instead.

Connecting real market data

The visualization can request data from the backend's "/api/indices" endpoint. To display real market data:

1. Start the backend.
2. Confirm the endpoint returns valid market-index data.
3. Configure the visualization to use the correct API URL.
4. Configure CORS if the frontend and backend are hosted on different origins.
5. Verify that the data provider supplies current information.

If the API is unavailable, the visualization may use demonstration data. Demo data must not be represented as live market data.

🔌 API Reference

The backend is built with FastAPI. Available routes depend on the implementation in "backend/main.py".

Endpoint| Purpose
"/"| Root endpoint or API status, if configured
"/docs"| Interactive API documentation
"/openapi.json"| OpenAPI schema
"/api/indices"| Market-index data, if implemented

To verify the exact routes supported by your running application, open:

http://127.0.0.1:8000/docs

Use the endpoint definitions displayed there as the source of truth before integrating the frontend.

🧠 Machine Learning Workflow

The intended prediction workflow is:

1. Obtain historical stock data from the configured data source.
2. Prepare and validate the input features.
3. Load the trained model and its required preprocessing components.
4. Generate a prediction for the supported input period.
5. Return the result to the frontend.
6. Visualize the output alongside the available market data.

Prediction quality depends on the training dataset, preprocessing, model architecture, evaluation methodology, and changing market conditions.

🚀 Deployment

The repository includes "render.yaml" for deployment configuration.

Before deploying:

1. Verify the Python runtime and dependency versions.
2. Confirm the correct FastAPI application import path.
3. Configure environment variables and any required API credentials.
4. Ensure model artifacts are available in the deployment environment.
5. Configure frontend API URLs to point to the deployed backend.
6. Configure CORS for the deployed frontend domain.
7. Test the API health and prediction endpoints after deployment.
8. Avoid committing credentials or secret environment variables to GitHub.

For the 3D visualization, GitHub Pages can host the static HTML file separately from the API backend.

🛠️ Troubleshooting

Module not found

Activate the virtual environment and install the required dependencies.

pip install -r backend/requirements.txt

Backend fails to start

Check the terminal traceback, confirm the working directory, and verify the FastAPI import path.

Frontend cannot connect to the backend

- Confirm the backend is running.
- Check the API base URL in the frontend JavaScript.
- Check browser developer tools for network and CORS errors.
- Confirm the requested endpoint exists.

Model or artifact not found

Verify the paths used by the prediction module and ensure the required model files are present.

3D globe does not load

- Use a modern browser with WebGL support.
- Serve the file through a local HTTP server.
- Check the browser console for CDN or JavaScript errors.
- Confirm that the browser has internet access if Three.js is loaded from a CDN.

Live data is unavailable

Check the backend response, data-provider configuration, and API connectivity. A working animation alone does not confirm that live market data is connected.

🔐 Security Best Practices

- Never upload API keys, passwords, or access tokens.
- Use environment variables for sensitive configuration.
- Validate and sanitize API inputs.
- Configure CORS with trusted origins in production.
- Add suitable request timeouts and error handling.
- Use HTTPS for deployed services.
- Do not expose private model files or credentials unintentionally.

🔮 Future Enhancements

- Real-time market data streaming.
- Watchlists and personalized dashboards.
- Technical indicators and chart-based analysis.
- Historical prediction evaluation.
- Portfolio tracking and risk analytics.
- More advanced 3D market visualizations.
- User authentication and saved preferences.
- Automated testing and continuous deployment.

🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make and test your changes.
4. Commit your changes with a descriptive message.
5. Open a pull request.

⚠️ Disclaimer

This project is intended for educational, analytical, and research purposes. Stock-market predictions are inherently uncertain. Nothing in this project constitutes financial advice or a recommendation to buy or sell securities. Always conduct independent research and understand the risks before making financial decisions.

👨‍💻 Author

Repository: "asuwathkumaresh07-cyber/stock_market" (https://github.com/asuwathkumaresh07-cyber/stock_market)

Built to explore stock market analytics, machine learning, interactive visualization, and modern web development.