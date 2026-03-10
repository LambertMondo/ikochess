<div align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" width="80" alt="Telegram Logo" />
  <img src="https://cdn-icons-png.flaticon.com/512/811/811462.png" width="80" alt="Chess Logo" />

  # ♟️ IkoChess

  **The ultimate real-time multiplayer Chess WebApp seamlessly integrated with Telegram Groups.**

  [**English**](README.en.md) | [Français](README.md)
</div>

<br />

IkoChess allows Telegram communities to challenge each other directly in their group chats, play seamlessly through Telegram WebApps, increase their global ELO ranking, and watch their friends' matches live as spectators.

---

## ✨ Features

- ⚔️ **Telegram Deep Integration**: Start a game directly from any Telegram group using the `/chess` command via the OpenClaw bot. No account creation needed – your Telegram profile *is* your account.
- ⚡ **Real-Time Multiplayer**: Instant, lag-free move synchronization powered by **Socket.io**.
- 🏆 **ELO Ranking System**: Gain or lose ELO points based on your match results (Win/Loss/Draw) against players globally.
- 👀 **Live Spectator Mode**: Group members can open the same link to watch matches locally live, complete with a real-time spectator counter.
- 🤖 **Stockfish AI**: Practice against the world's most powerful chess engine seamlessly integrated directly on the server, offering dynamic difficulties from *Easy* to *Grandmaster*.
- 💬 **Interactive Socials**: Throw emojis (😤, 🔥, 💀) across the board to distract or congratulate your opponent mid-game!
- ⏳ **Server-Auth Timers**: Highly accurate countdown timers synchronized and validated purely on the backend to prevent client-side manipulation.

---

## 🛠️ Technology Stack

IkoChess is built on a robust, modern JavaScript stack designed for extremely fast real-time connectivity and horizontal scalability.

### Frontend
- ⚛️ **React 18** (`react`, `react-dom`) — For building a highly reactive component-based UI.
- ⚡ **Vite** — Ultra-fast frontend tooling and bundling.
- ♜ **React-Chessboard** & **Chess.js** — For flawless visual board rendering and strict legal move generation/validation.
- 🔌 **Socket.io-Client** — Instant bidirectional event passing.

### Backend
- 🟢 **Node.js** & **Express** — Fast, event-driven, non-blocking I/O API layer.
- 🔌 **Socket.io** — The backbone of the real-time event broadcasting (rooms, namespaces).
- 🗄️ **Supabase (PostgreSQL)** — Database-as-a-Service for storing player stats, ELOs, and match history securely.
- 🐳 **Docker & Docker Compose** — Fully containerized for rapid, platform-agnostic deployments.
- 🧠 **Stockfish.js** *(New in V2)* — Server-side evaluation engine.

---

## 🚀 Getting Started

To spin up a local development instance of IkoChess, ensure you have **Node.js 20+** and **Docker** installed.

### 1. Clone the repository

```bash
git clone https://github.com/votre-nom/ikochess.git
cd ikochess
```

### 2. Configure Environment Variables

Create a `.env` file in the root and `server/` directories:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Ports
PORT=3000
VITE_SERVER_URL=http://localhost:3000
```

### 3. Build and Run via Docker

The easiest way to boot both the compiled client and the backend server:

```bash
docker compose up --build -d
```
*(The application will be exposed on `http://localhost:3000`)*

---

## 🏛️ Architecture & Refactoring (V2)
IkoChess recently underwent a major architectural refactor to migrate from a monolithic structure to a highly modular, decoupled service design featuring React components, specialized Socket controllers, and Redis pub/sub integration.

For a deep dive into the system's design patterns, read the [**Architecture Documentation**](./IkoChess_Architecture.md).

---

## 📜 License
This project is licensed under the [MIT License](LICENSE).
