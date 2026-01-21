# 🤖 Twitter (X) Automator: Autopilot Edition

Twitter (X) Automator is a high-performance, AI-driven desktop application designed to automate your Twitter/X presence. By leveraging the power of **Google Gemini AI**, it generates insightful, engaging, and professional content based on your chosen topics and schedules posts automatically.

**Now upgraded with Enterprise-Grade Security and Background Automation!** 🛡️👻

![Aesthetic Dark Mode UI](https://img.shields.io/badge/UI-Dark%20Mode-blueviolet)
![Styled with Tailwind](https://img.shields.io/badge/Styled%20with-Tailwind%20CSS-06B6D4)
![Powered by Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4285F4)
![Electron](https://img.shields.io/badge/Desktop-Electron-47848F)
![Security](https://img.shields.io/badge/Security-OS%20Encryption-green)

## ✨ Key Features

- **🧠 AI Content Engine**: Uses Gemini 2.5 Flash to generate context-aware, professional tweets under 280 characters.
- **🚀 Autopilot Mode**: Fully automated loop that picks random topics and generates posts every 40 minutes.
- **🛡️ Secure Storage**: API keys are encrypted using **OS-level encryption** (Windows DPAPI / Mac Keychain) — no keys are ever stored in plain text.
- **👻 Background Automation**: The app minimizes to the **System Tray**, keeping your automation running silently in the background even when the window is closed.
- **🔄 Auto-Updates**: Seamlessly updates itself via GitHub Releases, so you're always on the latest version.
- **📊 Topic Manager**: Manage up to 10 niche topics (e.g., AI, Crypto, Web Dev) to diversify your feed.
- **📝 Production Logging**: Robust file-based logging system for debugging issues in production builds.

## 🛠️ Tech Stack

- **Frontend**: React 19, Tailwind CSS (v3)
- **Desktop**: Electron (v33)
- **AI**: Google Generative AI (Gemini API)
- **Security**: Electron SafeStorage, Context Isolation
- **Storage**: Electron Store (Encrypted)
- **Logging**: Electron Log

## 🚀 Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- A Gemini API Key (from [Google AI Studio](https://aistudio.google.com/))
- Twitter API Credentials (from [Twitter Developer Portal](https://developer.twitter.com/))

### 2. Installation

Clone the repository and install dependencies:

```bash
npm install
```

### 3. Run the App

#### Development Mode (Recommended)

```bash
npm run electron:dev
```

Starts the React dev server and Electron window with hot-reloading enabled.

#### Production Build

```bash
npm run electron:build
```

Creates an optimized installer (`.exe` for Windows, `.dmg` for Mac) in the `dist/` folder.

## 🖥️ Desktop App Capabilities

### 🔒 Enterprise-Grade Security

We take security seriously. Unlike typical web apps:

- **Zero Plaintext Keys**: Your API keys are encrypted using **Electron's SafeStorage API**.
- **OS Integration**: Encryption uses **Windows Data Protection API (DPAPI)**, **macOS Keychain**, or **Linux Secret Service**.
- **Context Isolation**: The renderer process is isolated from Node.js APIs to prevent remote code execution attacks.

### 👻 System Tray & Background Run

Start the automation and forget about it.

- **Minimize to Tray**: Clicking "X" hides the window but keeps the app running in the system tray (notification area).
- **Control Menu**: Right-click the tray icon to "Show App" or "Quit" completely.
- **Persistent Operation**: Automation schedules continue uninterrupted in the background.

### 🔄 Seamless Auto-Updates

Stay up to date effortlessly.

- The app checks for updates from our GitHub repository on startup.
- Updates are downloaded in the background.
- The new version is installed automatically the next time you restart the app.

### 📂 Troubleshooting & Logs

If something goes wrong, detailed logs are available locally:

- **Windows**: `%APPDATA%\twitter-x-automator\logs\`
- **Mac**: `~/Library/Logs/twitter-x-automator/`

## 📖 How to Use

1.  **Configure**: Click the gear icon (Settings) and enter your API keys. They are encrypted instantly on save.
2.  **Add Topics**: Enter topics like "Machine Learning" or "Indie Hacking".
3.  **Deploy**:
    - Click **Start Autopilot** for continuous background automation.
    - Click **Run Once** to test a single tweet.
4.  **Hide**: Close the window to minimize to the tray.
5.  **Monitor**: Watch the standard logs in the UI or check the log files for deeper details.

---

_Created with ❤️ for X power users._
