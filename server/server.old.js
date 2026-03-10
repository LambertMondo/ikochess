import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { Chess } from 'chess.js'
import { createClient } from '@supabase/supabase-js'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

// Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://hhuwvivukaddykhxwtdu.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ''
)

// Qwen API config (same as OpenClaw)
const QWEN_API_URL = 'https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions'
const QWEN_API_KEY = process.env.QWEN_API_KEY || 'sk-sp-3ef7e7bead654e50a33f5f7b041797b4'

const AI_PLAYER_ID = 'AI_OPENCLAW'
const DEFAULT_TIME_MS = 15 * 60 * 1000 // 15 minutes per player

app.use(cors())
app.use(express.json())

// ── Game State ──
const games = new Map()
const players = new Map()   // telegramId → socketId
const spectators = new Map() // gameId → Set<socketId>

// ── ELO Calculation (fair, win-based) ──
const calculateEloChange = (playerElo, opponentElo, result) => {
  const K = 32
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))
  const actual = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5
  return Math.round(K * (actual - expected))
}

// ── DB Helpers ──
const ensurePlayer = async (telegramId, username) => {
  if (telegramId === AI_PLAYER_ID) return
  try {
    const { error } = await supabase
      .from('players')
      .upsert({ telegram_id: telegramId, username: username || telegramId, updated_at: new Date().toISOString() },
        { onConflict: 'telegram_id', ignoreDuplicates: true })
    if (error) console.error('Error ensuring player:', error)
  } catch (err) { console.error('Ensure player error:', err) }
}

const getPlayerElo = async (telegramId) => {
  if (telegramId === AI_PLAYER_ID) return 1200
  try {
    const { data } = await supabase.from('players').select('elo').eq('telegram_id', telegramId).single()
    return data?.elo || 1200
  } catch { return 1200 }
}

const getPlayerName = async (telegramId) => {
  if (telegramId === AI_PLAYER_ID) return 'OpenClaw AI'
  try {
    const { data } = await supabase.from('players').select('username').eq('telegram_id', telegramId).single()
    return data?.username || telegramId
  } catch { return telegramId }
}

const updatePlayerStats = async (telegramId, eloChange, result) => {
  if (telegramId === AI_PLAYER_ID) return
  try {
    const { data: player, error: fetchErr } = await supabase
      .from('players')
      .select('elo, score, games_played, games_won, games_lost, games_drawn')
      .eq('telegram_id', telegramId).single()
    if (fetchErr || !player) return

    // Scoring: Win=3, Draw=1, Loss=0
    const scoreAdd = result === 'win' ? 3 : result === 'draw' ? 1 : 0

    const updates = {
      elo: Math.max(100, player.elo + eloChange),
      score: (player.score || 0) + scoreAdd,
      games_played: player.games_played + 1,
      games_won: player.games_won + (result === 'win' ? 1 : 0),
      games_lost: player.games_lost + (result === 'loss' ? 1 : 0),
      games_drawn: player.games_drawn + (result === 'draw' ? 1 : 0),
      updated_at: new Date().toISOString()
    }
    await supabase.from('players').update(updates).eq('telegram_id', telegramId)
  } catch (err) { console.error('Stats update error:', err) }
}

const saveGame = async (gameId, gameData, result, reason, winnerId) => {
  try {
    await supabase.from('games').insert({
      game_id: gameId, white_player_id: gameData.white, black_player_id: gameData.black,
      winner_id: winnerId, moves: gameData.moves,
      fen_start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fen_end: gameData.game.fen(), result, reason, ended_at: new Date().toISOString()
    })
  } catch (err) { console.error('Save game error:', err) }
}

// ── AI Move Engine (Qwen API) ──
const AI_DIFFICULTY_PROMPTS = {
  easy: `You are a beginner chess player. You sometimes make obvious mistakes and miss simple tactics. Choose a reasonable but imperfect move. You should sometimes miss captures and leave pieces undefended.`,
  medium: `You are an intermediate chess player (around 1400 ELO). You play solid moves, understand basic tactics like forks and pins, but sometimes miss deeper combinations.`,
  hard: `You are a strong chess player (around 1800 ELO). You play excellent positional moves, see deep tactical combinations, and rarely make mistakes. Play the best move you can find.`,
  master: `You are a chess grandmaster. Play the absolute best move. Consider all tactical and positional factors. Think deeply and find the strongest continuation.`
}

const getAiMove = async (game, difficulty = 'medium') => {
  const moves = game.moves()
  if (moves.length === 0) return null

  const difficultyPrompt = AI_DIFFICULTY_PROMPTS[difficulty] || AI_DIFFICULTY_PROMPTS.medium

  try {
    const response = await fetch(QWEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${QWEN_API_KEY}`
      },
      body: JSON.stringify({
        model: 'qwen3.5-plus',
        messages: [
          {
            role: 'system',
            content: `${difficultyPrompt}\n\nYou are playing a chess game. Given the current board position, respond with ONLY the best move in standard algebraic notation (SAN). No explanation, no commentary, just the move like "e4", "Nf3", "Bxc6", "O-O", etc. The move MUST be one of the legal moves listed.`
          },
          {
            role: 'user',
            content: `Current FEN: ${game.fen()}\nMove history: ${game.history().join(' ')}\nLegal moves: ${moves.join(', ')}\n\nYour move (respond with ONLY the SAN move):`
          }
        ],
        max_tokens: 20,
        temperature: difficulty === 'easy' ? 1.2 : difficulty === 'medium' ? 0.7 : 0.3
      })
    })

    const data = await response.json()
    const aiResponse = data.choices?.[0]?.message?.content?.trim()

    if (aiResponse) {
      const cleanMove = aiResponse.replace(/[^a-zA-Z0-9+#=\-]/g, '').trim()
      if (moves.includes(cleanMove)) return cleanMove
      const found = moves.find(m => cleanMove.includes(m) || m.includes(cleanMove))
      if (found) return found
    }

    console.log(`AI fallback: Qwen response "${aiResponse}" not valid, picking random move`)
    return moves[Math.floor(Math.random() * moves.length)]
  } catch (err) {
    console.error('AI move error:', err.message)
    return moves[Math.floor(Math.random() * moves.length)]
  }
}

// ── Timer Management ──
const startTimer = (gameId) => {
  const gameData = games.get(gameId)
  if (!gameData || gameData.timerInterval) return

  gameData.lastTickTime = Date.now()

  gameData.timerInterval = setInterval(() => {
    const gd = games.get(gameId)
    if (!gd) { clearInterval(gameData.timerInterval); return }

    const now = Date.now()
    const elapsed = now - gd.lastTickTime
    gd.lastTickTime = now

    const activeColor = gd.game.turn() === 'w' ? 'white' : 'black'
    gd.timers[activeColor] = Math.max(0, gd.timers[activeColor] - elapsed)

    // Emit timer update to players + spectators
    io.to(gameId).emit('timer-update', {
      white: gd.timers.white,
      black: gd.timers.black
    })

    // Check timeout
    if (gd.timers[activeColor] <= 0) {
      clearInterval(gd.timerInterval)
      gd.timerInterval = null
      handleGameOver(gameId, gd, 'timeout', activeColor === 'white' ? 'black' : 'white')
    }
  }, 1000)
}

const stopTimer = (gameId) => {
  const gameData = games.get(gameId)
  if (gameData?.timerInterval) {
    clearInterval(gameData.timerInterval)
    gameData.timerInterval = null
  }
}

// ── Handle game-over logic ──
const handleGameOver = async (gameId, gameData, overrideReason, overrideWinnerColor) => {
  // Prevent double processing
  if (gameData.finished) return
  gameData.finished = true

  stopTimer(gameId)

  let result = 'draw'
  let reason = overrideReason || 'draw'
  let winner = null

  if (overrideWinnerColor) {
    // Resignation, timeout, etc.
    result = `${overrideWinnerColor}-wins`
    winner = overrideWinnerColor === 'white' ? gameData.white : gameData.black
  } else if (gameData.game.isCheckmate()) {
    const whoMoved = gameData.game.turn() === 'w' ? 'black' : 'white'
    result = `${whoMoved}-wins`
    reason = 'checkmate'
    winner = whoMoved === 'white' ? gameData.white : gameData.black
  } else if (gameData.game.isStalemate()) {
    reason = 'stalemate'
  } else if (gameData.game.isThreefoldRepetition()) {
    reason = 'threefold-repetition'
  } else if (gameData.game.isInsufficientMaterial()) {
    reason = 'insufficient-material'
  }

  // Get names for display
  const whiteName = await getPlayerName(gameData.white)
  const blackName = await getPlayerName(gameData.black)

  // Update ELO + Score
  const whiteElo = await getPlayerElo(gameData.white)
  const blackElo = await getPlayerElo(gameData.black)
  let whiteChange = 0, blackChange = 0

  if (winner) {
    const loserId = winner === gameData.white ? gameData.black : gameData.white
    const winnerElo = winner === gameData.white ? whiteElo : blackElo
    const loserElo = winner === gameData.white ? blackElo : whiteElo
    const winnerChange = calculateEloChange(winnerElo, loserElo, 'win')
    const loserChange = calculateEloChange(loserElo, winnerElo, 'loss')

    await updatePlayerStats(winner, winnerChange, 'win')
    await updatePlayerStats(loserId, loserChange, 'loss')

    whiteChange = winner === gameData.white ? winnerChange : loserChange
    blackChange = winner === gameData.black ? winnerChange : loserChange
  } else {
    whiteChange = calculateEloChange(whiteElo, blackElo, 'draw')
    blackChange = calculateEloChange(blackElo, whiteElo, 'draw')
    await updatePlayerStats(gameData.white, whiteChange, 'draw')
    await updatePlayerStats(gameData.black, blackChange, 'draw')
  }

  await saveGame(gameId, gameData, result, reason, winner)
  await supabase.from('chess_challenges').update({ status: 'finished' }).eq('game_id', gameId)

  io.to(gameId).emit('game-over', {
    result, reason,
    whiteName, blackName,
    whiteElo: whiteElo + whiteChange, blackElo: blackElo + blackChange,
    whiteChange, blackChange
  })

  games.delete(gameId)
  spectators.delete(gameId)
}

// ── AI auto-play after human move ──
const scheduleAiMove = (gameId, gameData) => {
  const delay = 1000 + Math.random() * 2000
  setTimeout(async () => {
    if (!games.has(gameId) || gameData.finished) return
    const difficulty = gameData.aiDifficulty || 'medium'
    const aiMoveSan = await getAiMove(gameData.game, difficulty)
    if (!aiMoveSan) return

    try {
      const moveResult = gameData.game.move(aiMoveSan)
      if (!moveResult) return
      gameData.moves.push(moveResult)

      // Reset timer tick for human player
      gameData.lastTickTime = Date.now()

      io.to(gameId).emit('opponent-move', { move: moveResult, fen: gameData.game.fen() })

      if (gameData.game.isGameOver()) {
        await handleGameOver(gameId, gameData)
      }
    } catch (err) {
      console.error('AI move execution error:', err)
    }
  }, delay)
}

// ── Socket.io ──
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id)

  // ── Join a game from a challenge (Telegram-initiated) ──
  socket.on('join-challenge', async ({ gameId, telegramId }) => {
    socket.telegramId = telegramId
    players.set(telegramId, socket.id)

    let gameData = games.get(gameId)

    if (gameData) {
      socket.join(gameId)
      const color = gameData.white === telegramId ? 'white' : 'black'
      const whiteName = await getPlayerName(gameData.white)
      const blackName = await getPlayerName(gameData.black)
      socket.emit('game-started', {
        gameId, color, white: gameData.white, black: gameData.black, whiteName, blackName,
        fen: gameData.game.fen(), isAiGame: gameData.isAiGame, aiDifficulty: gameData.aiDifficulty,
        timers: gameData.timers
      })
      return
    }

    const { data: challenge } = await supabase
      .from('chess_challenges').select('*').eq('game_id', gameId).single()

    if (!challenge || challenge.status === 'expired' || challenge.status === 'cancelled') {
      socket.emit('error', { message: 'Game not found or expired' })
      return
    }

    await ensurePlayer(telegramId, challenge.challenger_id === telegramId ? challenge.challenger_name : challenge.opponent_name)

    const isAiGame = challenge.is_ai_game
    const whiteId = challenge.challenger_id
    const blackId = isAiGame ? AI_PLAYER_ID : challenge.opponent_id

    gameData = {
      game: new Chess(),
      white: whiteId,
      black: blackId,
      moves: [],
      isAiGame,
      aiDifficulty: challenge.ai_difficulty || 'medium',
      createdAt: new Date(),
      timers: { white: DEFAULT_TIME_MS, black: DEFAULT_TIME_MS },
      lastTickTime: null,
      timerInterval: null,
      drawOffer: null,
      finished: false
    }
    games.set(gameId, gameData)
    socket.join(gameId)

    await supabase.from('chess_challenges').update({ status: 'playing' }).eq('game_id', gameId)

    const whiteName = await getPlayerName(whiteId)
    const blackName = await getPlayerName(blackId)
    const color = whiteId === telegramId ? 'white' : 'black'

    socket.emit('game-started', {
      gameId, color, white: whiteId, black: blackId, whiteName, blackName,
      fen: gameData.game.fen(), isAiGame, aiDifficulty: gameData.aiDifficulty,
      timers: gameData.timers
    })

    // Start the timer when the game begins
    startTimer(gameId)
  })

  // Legacy: create a game directly (website-only)
  socket.on('create-game', async ({ telegramId, username }) => {
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    socket.telegramId = telegramId
    await ensurePlayer(telegramId, username)

    games.set(gameId, {
      game: new Chess(), white: telegramId, black: null, moves: [],
      isAiGame: false, createdAt: new Date(),
      timers: { white: DEFAULT_TIME_MS, black: DEFAULT_TIME_MS },
      lastTickTime: null, timerInterval: null, drawOffer: null, finished: false
    })
    players.set(telegramId, socket.id)
    socket.join(gameId)
    socket.emit('game-created', { gameId })
    io.emit('game-available', { gameId, creator: telegramId })
  })

  // Legacy: join a game directly
  socket.on('join-game', async ({ gameId, telegramId, username }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.black) {
      socket.emit('error', { message: 'Game not found or already full' })
      return
    }
    socket.telegramId = telegramId
    await ensurePlayer(telegramId, username)
    gameData.black = telegramId
    players.set(telegramId, socket.id)
    socket.join(gameId)

    const whiteName = await getPlayerName(gameData.white)
    const blackName = await getPlayerName(telegramId)
    const whiteSocketId = players.get(gameData.white)
    if (whiteSocketId) {
      io.to(whiteSocketId).emit('game-started', {
        gameId, color: 'white', white: gameData.white, black: telegramId,
        whiteName, blackName, timers: gameData.timers
      })
    }
    socket.emit('game-started', {
      gameId, color: 'black', white: gameData.white, black: telegramId,
      whiteName, blackName, timers: gameData.timers
    })
    startTimer(gameId)
  })

  // ── Make a move ──
  socket.on('make-move', async ({ gameId, move }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished) { socket.emit('error', { message: 'Game not found' }); return }

    const currentTurn = gameData.game.turn() === 'w' ? 'white' : 'black'
    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'

    if (currentTurn !== playerColor) {
      socket.emit('error', { message: 'Not your turn!' })
      return
    }

    try {
      const moveResult = gameData.game.move(move)
      if (!moveResult) { socket.emit('error', { message: 'Invalid move' }); return }

      gameData.moves.push(moveResult)

      // Reset timer tick for the next player's turn
      gameData.lastTickTime = Date.now()

      // Clear any draw offer after a move
      if (gameData.drawOffer) {
        gameData.drawOffer = null
        io.to(gameId).emit('draw-declined', {})
      }

      socket.to(gameId).emit('opponent-move', { move: moveResult, fen: gameData.game.fen() })

      if (gameData.game.isGameOver()) {
        await handleGameOver(gameId, gameData)
      } else if (gameData.isAiGame) {
        scheduleAiMove(gameId, gameData)
      }
    } catch (error) {
      console.error('Invalid move:', error)
      socket.emit('error', { message: 'Invalid move' })
    }
  })

  // ── Resign ──
  socket.on('resign', async ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished) return

    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'
    const winnerColor = playerColor === 'white' ? 'black' : 'white'

    await handleGameOver(gameId, gameData, 'resignation', winnerColor)
  })

  // ── Draw Proposal ──
  socket.on('offer-draw', ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished || gameData.isAiGame) return

    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'

    // Can't offer draw to yourself or if already pending
    if (gameData.drawOffer === playerColor) return

    gameData.drawOffer = playerColor
    socket.to(gameId).emit('draw-offered', { from: playerColor })
  })

  socket.on('accept-draw', async ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished || !gameData.drawOffer) return

    // Only the opponent of the one who offered can accept
    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'
    if (gameData.drawOffer === playerColor) return // Can't accept your own offer

    await handleGameOver(gameId, gameData, 'agreement', null)
  })

  socket.on('decline-draw', ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData || !gameData.drawOffer) return

    gameData.drawOffer = null
    io.to(gameId).emit('draw-declined', {})
  })

  // ── Emoji / Pikes ──
  socket.on('send-emoji', ({ gameId, emoji }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished) return

    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'
    const allowedEmojis = ['😤', '🔥', '😎', '🤔', '💀', '👏']
    if (!allowedEmojis.includes(emoji)) return

    // Broadcast to everyone in the room (including spectators)
    socket.to(gameId).emit('emoji-received', { emoji, from: playerColor })
  })

  // ── Spectator Mode ──
  socket.on('join-spectate', async ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData) {
      socket.emit('error', { message: 'Game not found' })
      return
    }

    socket.join(gameId)

    if (!spectators.has(gameId)) spectators.set(gameId, new Set())
    spectators.get(gameId).add(socket.id)

    const whiteName = await getPlayerName(gameData.white)
    const blackName = await getPlayerName(gameData.black)

    socket.emit('spectate-started', {
      gameId,
      white: gameData.white, black: gameData.black,
      whiteName, blackName,
      fen: gameData.game.fen(),
      isAiGame: gameData.isAiGame,
      aiDifficulty: gameData.aiDifficulty,
      timers: gameData.timers,
      moveHistory: gameData.moves
    })
  })

  // ── Disconnect ──
  socket.on('disconnect', () => {
    for (const [telegramId, socketId] of players.entries()) {
      if (socketId === socket.id) { players.delete(telegramId); break }
    }
    // Clean up spectators
    for (const [gId, specSet] of spectators.entries()) {
      specSet.delete(socket.id)
      if (specSet.size === 0) spectators.delete(gId)
    }
  })
})

// ── API Routes ──

// Create challenge (called by Telegram bot plugin)
app.post('/api/challenge', async (req, res) => {
  const { challengerId, challengerName, groupChatId, isAiGame, aiDifficulty } = req.body
  const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  await ensurePlayer(challengerId, challengerName)

  const { error } = await supabase.from('chess_challenges').insert({
    game_id: gameId, challenger_id: challengerId, challenger_name: challengerName,
    group_chat_id: groupChatId, is_ai_game: isAiGame || false,
    ai_difficulty: aiDifficulty || 'medium', status: 'pending'
  })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ gameId })
})

// Accept challenge (called by Telegram bot plugin)
app.post('/api/challenge/:gameId/accept', async (req, res) => {
  const { opponentId, opponentName } = req.body
  const { gameId } = req.params

  const { data: challenge, error: fetchErr } = await supabase
    .from('chess_challenges').select('*').eq('game_id', gameId).eq('status', 'pending').single()

  if (fetchErr || !challenge) return res.status(404).json({ error: 'Challenge not found or already accepted' })
  if (challenge.challenger_id === opponentId) return res.status(400).json({ error: 'Cannot accept your own challenge' })

  await ensurePlayer(opponentId, opponentName)

  const { error } = await supabase.from('chess_challenges').update({
    opponent_id: opponentId, opponent_name: opponentName, status: 'accepted'
  }).eq('game_id', gameId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true, challenge: { ...challenge, opponent_id: opponentId, opponent_name: opponentName } })
})

// Get challenge info
app.get('/api/challenge/:gameId', async (req, res) => {
  const { data, error } = await supabase
    .from('chess_challenges').select('*').eq('game_id', req.params.gameId).single()
  if (error) return res.status(404).json({ error: 'Challenge not found' })
  res.json(data)
})

// Rankings — includes score + full stats
app.get('/api/rankings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('players').select('telegram_id, username, elo, score, games_played, games_won, games_lost, games_drawn')
      .order('score', { ascending: false }).limit(50)
    if (error) throw error
    res.json(data)
  } catch (error) { res.status(500).json({ error: error.message }) }
})

// Active game state
app.get('/api/game/:gameId', (req, res) => {
  const gameData = games.get(req.params.gameId)
  if (!gameData) return res.status(404).json({ error: 'Game not found' })
  res.json({
    gameId: req.params.gameId, fen: gameData.game.fen(), moves: gameData.moves,
    white: gameData.white, black: gameData.black,
    turn: gameData.game.turn() === 'w' ? 'white' : 'black',
    isAiGame: gameData.isAiGame, timers: gameData.timers
  })
})

// ── Static files + SPA fallback ──
const clientDist = path.join(__dirname, '..', 'client', 'dist')
app.use(express.static(clientDist))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', games: games.size, players: players.size })
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
