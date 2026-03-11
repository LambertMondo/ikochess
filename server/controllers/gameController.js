import { Chess } from 'chess.js'
import { AI_PLAYER_ID, ensurePlayer, getPlayerName, supabase } from '../db.js'
import { getAiMove } from '../ai.js'
import { startTimer, handleGameOver, DEFAULT_TIME_MS, evaluateMoveQuality } from '../game/engine.js'

const scheduleAiMove = (gameId, gameData, games, io) => {
  if (!gameData.ready.white || !gameData.ready.black) return

  const delay = 1000 + Math.random() * 2000
  setTimeout(async () => {
    if (!games.has(gameId) || gameData.finished) return
    
    const difficulty = gameData.aiDifficulty || 'medium'
    const aiMoveSan = await getAiMove(gameData.game, difficulty)
    if (!aiMoveSan) return

    try {
      const fenBefore = gameData.game.fen()
      const moveResult = gameData.game.move(aiMoveSan)
      if (!moveResult) return
      
      gameData.moves.push(moveResult)
      gameData.lastTickTime = Date.now()

      const moveQuality = evaluateMoveQuality(fenBefore, gameData.game.fen(), moveResult.san)

      io.to(gameId).emit('opponent-move', { 
        move: moveResult, 
        fen: gameData.game.fen(),
        quality: moveQuality
      })

      if (gameData.game.isGameOver()) {
        await handleGameOver(gameId, gameData, games, io)
      }
    } catch (err) {
      console.error('AI move execution error:', err)
    }
  }, delay)
}

export const registerGameHandlers = (io, socket, games, players) => {
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
        gameId, color, 
        white: gameData.white, black: gameData.black, 
        whiteName, blackName,
        fen: gameData.game.fen(), 
        isAiGame: gameData.isAiGame, 
        aiDifficulty: gameData.aiDifficulty,
        timers: gameData.timers,
        ready: gameData.ready
      })
      return
    }

    const { data: challenge } = await supabase
      .from('chess_challenges').select('*').eq('game_id', gameId).single()

    if (!challenge || challenge.status === 'expired' || challenge.status === 'cancelled') {
      socket.emit('error', { message: 'Partie introuvable ou lien expiré' })
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
      finished: false,
      ready: { white: isAiGame, black: isAiGame }
    }
    
    games.set(gameId, gameData)
    socket.join(gameId)

    await supabase.from('chess_challenges').update({ status: 'playing' }).eq('game_id', gameId)

    const whiteName = await getPlayerName(whiteId)
    const blackName = await getPlayerName(blackId)
    const color = whiteId === telegramId ? 'white' : 'black'

    socket.emit('game-started', {
      gameId, color, 
      white: whiteId, black: blackId, 
      whiteName, blackName,
      fen: gameData.game.fen(), 
      isAiGame, 
      aiDifficulty: gameData.aiDifficulty,
      timers: gameData.timers,
      ready: gameData.ready
    })

    if (isAiGame) {
      startTimer(gameId, games, io)
      io.to(gameId).emit('game-ready-to-play')
      if (gameData.game.turn() === 'b' && gameData.black === AI_PLAYER_ID) {
         scheduleAiMove(gameId, gameData, games, io)
      }
    }
  })

  socket.on('player-ready', ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished) return

    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'
    gameData.ready[playerColor] = true

    io.to(gameId).emit('player-ready-update', { color: playerColor, ready: true })

    if (gameData.ready.white && gameData.ready.black) {
      startTimer(gameId, games, io)
      io.to(gameId).emit('game-ready-to-play')

      if (gameData.isAiGame && gameData.game.turn() === 'b' && gameData.black === AI_PLAYER_ID) {
         scheduleAiMove(gameId, gameData, games, io)
      }
    }
  })

  socket.on('make-move', async ({ gameId, move }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished) { 
      socket.emit('error', { message: 'Partie introuvable' })
      return 
    }

    if (!gameData.ready.white || !gameData.ready.black) {
      socket.emit('error', { message: 'Les deux joueurs doivent être prêts !' })
      return
    }

    const currentTurn = gameData.game.turn() === 'w' ? 'white' : 'black'
    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'

    if (currentTurn !== playerColor) {
      socket.emit('error', { message: "Ce n'est pas votre tour !" })
      return
    }

    try {
      const fenBefore = gameData.game.fen()
      const moveResult = gameData.game.move(move)
      if (!moveResult) { 
        socket.emit('error', { message: 'Coup invalide' })
        return 
      }

      gameData.moves.push(moveResult)
      gameData.lastTickTime = Date.now()

      if (gameData.drawOffer) {
        gameData.drawOffer = null
        io.to(gameId).emit('draw-declined', {})
      }

      const moveQuality = evaluateMoveQuality(fenBefore, gameData.game.fen(), moveResult.san)

      socket.to(gameId).emit('opponent-move', { 
        move: moveResult, 
        fen: gameData.game.fen(),
        quality: moveQuality
      })

      if (gameData.game.isGameOver()) {
        await handleGameOver(gameId, gameData, games, io)
      } else if (gameData.isAiGame) {
        scheduleAiMove(gameId, gameData, games, io)
      }
    } catch (error) {
      console.error('Invalid move error:', error)
      socket.emit('error', { message: 'Coup non autorisé' })
    }
  })

  socket.on('resign', async ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished) return

    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'
    const winnerColor = playerColor === 'white' ? 'black' : 'white'

    await handleGameOver(gameId, gameData, games, io, 'resignation', winnerColor)
  })

}
