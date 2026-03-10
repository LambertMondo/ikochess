import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Import modules
import { setupSockets } from './sockets.js'
import { setupRoutes } from './routes.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

app.use(cors())
app.use(express.json())

// ── Global State ──
// Note: Kept in memory. Since we are using a single server structure, 
// there is no need for a Redis adapter right now.
const games = new Map()
const players = new Map()     // telegramId → socketId
const spectators = new Map()   // gameId → Set<socketId>

// ── Setup Integrations ──
setupSockets(io, games, players, spectators)
setupRoutes(app, games, players)

// ── Static files & fallback ──
const clientDist = path.join(__dirname, '..', 'client', 'dist')
app.use(express.static(clientDist))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', games: games.size, players: players.size, spectators: spectators.size })
})

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(clientDist, 'index.html'))
  }
})

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Chess server running on port ${PORT}`)
})
