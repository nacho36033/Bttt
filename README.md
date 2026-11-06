# BTC PULSE

Live Bitcoin 5 / 10 / 15-minute direction signals (UP / DOWN / NO TRADE) from Coinbase data. React + TypeScript + Vite, installable PWA, hosted free on GitHub Pages. Analysis only: no trading, no wallet, no API keys.

## Deploy (GitHub Pages)
1. Create an empty GitHub repository (e.g. `btc-pulse`).
2. Upload this folder's contents to it (or `git init && git add . && git commit -m init && git branch -M main && git remote add origin <url> && git push -u origin main`).
3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab. The "Deploy to GitHub Pages" run builds and publishes the site. If the first run happened before step 3, press **Re-run**.
5. Open `https://<your-user>.github.io/<repo>/` on your phone. iPhone: Share → **Add to Home Screen**. Android: menu → **Install app**.

Every push to `main` redeploys automatically. Local development: `npm install && npm run dev`.

## How it works
- **Data**: live price, trades and order book from the Coinbase Advanced Trade WebSocket (`wss://advanced-trade-ws.coinbase.com`, BTC-USD); historical 1-minute candles from Coinbase's public candles endpoint. Auto-reconnects, shows a warning and the last update time when the feed is stale. Nothing is simulated.
- **Three engines** (`src/lib/predict.ts`): each horizon works on its own bar size (1m, 2m, 3m bars), its own signal weights and its own volatility range. Signals: EMA 9/21/50, RSI 14, MACD, VWAP, Bollinger, ATR, volume thrust, breakouts/structure, candlestick patterns, taker order flow, order-book imbalance. Weighted agreement decides the call; conflicting signals or a volatility spike produce NO TRADE.
- **Probability** is calibrated against walk-forward backtest results. **Confidence** = edge strength x signal agreement.
- **Backtest** runs on the last ~20 hours of 1-minute candles at startup, strictly chronological. It cannot use historical order flow or book data, so it tests the candle-based part of the model. It is reported separately from live results.
- **Live tracking**: every prediction is saved in `localStorage` and scored at expiry against the last 1-minute candle close at or before expiry (up to one minute of error). NO TRADE calls are saved but not scored.
- **Notifications**: work while the app is open (no push server). On iPhone they need iOS 16.4+ and the app added to the Home Screen.

No accuracy figure is hardcoded: all numbers come from your own backtest and your own tracked predictions. Short-term Bitcoin moves are close to random; treat the output as one input, not advice.
