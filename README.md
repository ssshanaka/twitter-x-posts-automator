# 🤖 Tweet Automator: Autopilot Edition

Tweet Automator is a high-performance, AI-driven application designed to automate your Twitter/X presence. By leveraging the power of **Google Gemini AI**, it generates insightful, engaging, and professional content based on your chosen topics and schedules posts automatically.

![Aesthetic Dark Mode UI](https://img.shields.io/badge/UI-Dark%20Mode-blueviolet)
![Tailwind CSS](https://img.shields.io/badge/Styled%20with-Tailwind%20CSS-06B6D4)
![Powered by Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4285F4)

## ✨ Key Features

- **🧠 AI Content Engine**: Uses Gemini 2.5 Flash to generate context-aware, professional tweets under 280 characters.
- **🚀 Autopilot Mode**: Fully automated loop that picks random topics and posts every 40 minutes.
- **📊 Topic Manager**: Add up to 10 niche topics (e.g., AI, Crypto, Web Dev) to diversify your feed.
- **🖥️ System Console**: Real-time terminal-style logging to track generations, signings, and API responses.
- **🔒 Secure Configuration**: Secrets are managed via `.env` files and local persistence, keeping your keys safe and private.
- **🎨 Premium UI**: A sleek, glassmorphic dark interface built with Tailwind CSS and Lucide icons.

## 🛠️ Tech Stack

- **Frontend**: React 19
- **Styling**: Tailwind CSS (v3)
- **AI**: Google Generative AI (Gemini API)
- **Authentication**: OAuth 1.0a (Custom Native Implementation)
- **Icons**: Lucide React

## 🚀 Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- A Gemini API Key (from [Google AI Studio](https://aistudio.google.com/))
- Twitter API Credentials (Consumer Key/Secret & Access Token/Secret from [Twitter Developer Portal](https://developer.twitter.com/))

### 2. Installation

Clone the repository and install dependencies:

```bash
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory and add your credentials:

```env
REACT_APP_GEMINI_KEY=your_gemini_key
REACT_APP_TWITTER_CONSUMER_KEY=your_key
REACT_APP_TWITTER_CONSUMER_SECRET=your_secret
REACT_APP_TWITTER_ACCESS_TOKEN=your_token
REACT_APP_TWITTER_TOKEN_SECRET=your_token_secret
REACT_APP_CORS_PROXY=https://cors-anywhere.herokuapp.com/
```

### 4. Run the App

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

## 📖 How to Use

1.  **Configure**: Click the gear icon (Settings) in the top right to verify your API keys.
2.  **Add Topics**: Enter topics like "Machine Learning" or "Productivity" in the Topic Manager.
3.  **Deploy**:
    - Click **Start Autopilot** for hands-free automation.
    - Click **Run Once** to generate and post a single tweet immediately.
4.  **Monitor**: Watch the **System Logs** to see the AI in action.

## ⚠️ Important Notes

- **CORS Proxy**: Direct browser-to-Twitter API calls are blocked by CORS. The app uses a proxy (defaulting to Heroku's CORS Anywhere). For production use, it is recommended to host your own proxy.
- **Persistence**: Your configuration and topics are saved to your browser's `localStorage`.
- **Keep it Open**: Autopilot requires the browser tab to remain active.

---

_Created with ❤️ for X power users._
