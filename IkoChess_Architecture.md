# ♟️ IkoChess Architecture Documentation

Welcome to the architectural overview of **IkoChess**, a modern, real-time, multi-player chess application seamlessly integrated with Telegram.

This document serves to explain the evolution of the project from its initial monolithic design (V1) to its new, scalable, and decentralized architecture (V2).

---

## 🏗️ Evolution: From Monolith (V1) to Micro-Services (V2)

### The Old Architecture (V1)
In the initial version, the application was built fast to prove the concept:
- **Client Monolith**: `App.jsx` contained everything: the chessboard, the chat, the HUD, the spectator logic, and the timer formatting. It stood at ~600 lines, making it difficult to maintain or style individual components without side effects.
- **Server Monolith**: `sockets.js` handled every single WebSocket event from matchmaking, moving pieces, spectator mode, and emojis.
- **State Management**: Game state (`games`, `players`, `spectators`) was stored purely in-memory using Node.js `Map` objects. This meant the server could not be horizontally scaled.
- **AI Integration**: The AI logic relied on LLMs (Qwen API). While creative, it often required a fallback to random moves due to the LLM "hallucinating" illegal chess moves.

### The New Architecture (V2)
The refactored **IkoChess** introduces separation of concerns, higher reliability, and massive scalability.

#### 1. Frontend: Component-Driven Design
The frontend has been broken down into isolated, reusable React components:
- **`ChessBoardArea.jsx`**: Purely handles the `react-chessboard` and the `make-move` logic.
- **`ChessHUD.jsx`**: Handles the player plaques, ELO display, and the synchronized countdown timers.
- **`ChatAndSpectator.jsx`**: Isolates the social features—emoji throwing, draw/resign actions, and the live spectator count.
- **`App.jsx`**: Now acts solely as the **Container/Controller**, managing the global WebSocket connection and orchestrating state down to its pure child components.

#### 2. Backend: Modular Service-Oriented Logic
The server has been split into specific controllers:
- **`gameController.js`**: Core game logic (moves, ready-checks).
- **`chatController.js`**: Social interactions (emojis, draw logic).
- **`spectatorController.js`**: Observer management.

#### 3. Scaling: Redis Adapter
By integrating the `@socket.io/redis-adapter` and connecting to a Redis instance, the real-time pub/sub features are decoupled from a single Node.js process. This allows spinning up multiple Docker containers of the backend to handle thousands of concurrent players without WebSockets dropping or missing messages.

#### 4. The Intelligence: Stockfish Automation
We replaced the LLM-based API with **Stockfish.js** running directly on the server.
- **Why?** Stockfish is the absolute gold standard for chess engines. It guarantees 100% legal moves, evaluates millions of positions per second, and accurately scales its difficulty (Skill Level).
- **Result**: Zero API costs, zero illegal moves, and a much sharper AI opponent for the "Master" difficulty setting.

---

## 📡 The Telegram Integration (OpenClaw)

One of the most unique aspects of IkoChess is its deep integration with the **OpenClaw Telegram Bot**:
1. **Matchmaking**: Players type `/chess` in a Telegram Group to throw down a gauntlet.
2. **Deep Linking**: The bot generates a unique `gameId` and creates a customized WebApp link containing the players' `telegramId`s.
3. **Seamless Auth**: The web app reads the Telegram WebApp parameters natively, automatically linking their OpenClaw profiles, ELO, and usernames securely into the game session. No passwords required.
4. **Broadcasts**: Challenge expirations, match results, and ranking updates flow back directly into the Telegram group seamlessly.

*Built with ❤️ for the Telegram gaming community.*
