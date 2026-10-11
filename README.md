# Kaizen+

**A cleaner way to manage your Kaizen dashboard.**

Kaizen+ is a browser-based dashboard for configuring the features included in this project. Start the Node.js server, open the local dashboard, and manage your connected account from one place.

## Dashboard preview

Hereâ€™s an illustrative preview of the dashboardâ€™s first-launch screen:

![Illustrative preview of the Kaizen+ dashboard and account sign-in](dashboard/public/dashboard-preview.svg)

## Features

- Dashboard for account status and feature access
- Account connection and settings controls
- AFK tools and configurable commands
- Optional AI features powered by NVIDIA NIM
- Session-only credentials: account tokens and the NVIDIA API key are not saved to disk

## Requirements

- [Node.js](https://nodejs.org/) and npm
- A supported operating system that can run Node.js
- A browser to open the dashboard

## Install and run

Choose either installation method. Both install the project dependencies and start the same dashboard.

### Option 1: Clone the repository

```bash
git clone https://github.com/mhamad783/kaizen.git
cd kaizen
npm install
npm start
```

### Option 2: Download the ZIP

1. Open the [Kaizen+ repository](https://github.com/mhamad783/kaizen) on GitHub.
2. Select **Code â†’ Download ZIP**.
3. Move the ZIP file to your server and extract it.
4. Open a terminal in the extracted project folderâ€”the folder containing `package.json`â€”then run:

```bash
npm install
npm start
```

When the server starts, open **http://localhost:3000** in a browser on the same machine.

## First launch

1. Start Kaizen+ with `npm start`.
2. Open the dashboard at `http://localhost:3000`.
3. Enter your account token in the dashboard prompt to connect.
4. To use AI, open the **AI Chat** tab and enter an NVIDIA API key when prompted.

The AI integration uses NVIDIA NIM's chat completions endpoint and the `deepseek-ai/deepseek-v4-flash` model. NVIDIA trial availability, quotas, and rate limits depend on your account and key.

## Security and data

- Account tokens and the NVIDIA API key are held in server memory only. They are cleared when the server stops, so you must enter them again after restarting.
- Dashboard settings are stored locally in the project's `data` directory.
- The web server binds to `0.0.0.0` by default so container and hosting platforms can reach it. The dashboard does not provide login protection; do not expose it directly to the public internet without network access controls or an authenticated reverse proxy.
- Use this project only in ways that comply with Discord's Terms of Service and all applicable policies. Automating a personal Discord account may be restricted by Discord.

## Configuration

The server defaults to port `3000` for local use. Copy `.env.example` to `.env` to configure it manually: keep `PORT=3000` locally, or replace it with your hosting provider's assigned port (for example, `PORT=38747`). A `PORT` supplied directly by the hosting platform takes precedence over `.env`.

## Troubleshooting

- **`npm` or `node` is not recognized:** Install Node.js, then open a new terminal and try again.
- **The dashboard does not open:** Confirm `npm start` is still running and visit `http://localhost:3000`.
- **The account does not connect:** Re-enter the token and check the server terminal for the connection error.
- **The AI key is rejected or times out:** Confirm the key has access to NVIDIA NIM and that the model is available to your NVIDIA account. Trial limits or temporary service delays may also prevent a response.
