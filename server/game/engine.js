import { getPlayerName, getPlayerElo, updatePlayerStats, saveGame, supabase } from '../db.js'

export const DEFAULT_TIME_MS = 15 * 60 * 1000 // 15 minutes per player

export const calculateEloChange = (playerElo, opponentElo, result) => {
  const K = 32
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))
  const actual = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5
  return Math.round(K * (actual - expected))
}

// Simple heuristic evaluation to assign expressional symbols (!!, ??)
export const evaluateMoveQuality = (fenBefore, fenAfter, moveSan) => {
  // A complete engine (like Stockfish) is required for real evaluations.
  // Here we do a very naive material check + capture detection to simulate !! or ??
  
  if (moveSan.includes('#')) return '!!' // Mate is always brilliant
  if (moveSan.includes('+') && moveSan.includes('x')) return '!' // Check with capture is good
  
  // Very basic heuristic: if it's a huge capture, maybe give an !
  if (moveSan.includes('xQ')) return '!!'
  if (moveSan.includes('xR')) return '!'

  // Without a full engine, we'll rarely assign ?? accurately. 
  // We'll leave the hooks ready for a future Stockfish integration.
  return ''
}

export const startTimer = (gameId, games, io) => {
  const gameData = games.get(gameId)
  
  // Don't start if both players aren't ready yet
  if (!gameData || gameData.timerInterval || !gameData.ready.white || !gameData.ready.black) return

  gameData.lastTickTime = Date.now()

  gameData.timerInterval = setInterval(() => {
    const gd = games.get(gameId)
    if (!gd) { 
      clearInterval(gameData.timerInterval)
      return 
    }

    const now = Date.now()
    const elapsed = now - gd.lastTickTime
    gd.lastTickTime = now

    const activeColor = gd.game.turn() === 'w' ? 'white' : 'black'
    gd.timers[activeColor] = Math.max(0, gd.timers[activeColor] - elapsed)

    // Emit timer update to players + spectators
    io.to(gameId).emit('timer_sync', {
      white: gd.timers.white,
      black: gd.timers.black
    })

    // Check timeout
    if (gd.timers[activeColor] <= 0) {
      clearInterval(gd.timerInterval)
      gd.timerInterval = null
      handleGameOver(gameId, gd, games, io, 'timeout', activeColor === 'white' ? 'black' : 'white')
    }
  }, 1000)
}

export const stopTimer = (gameId, games) => {
  const gameData = games.get(gameId)
  if (gameData?.timerInterval) {
    clearInterval(gameData.timerInterval)
    gameData.timerInterval = null
  }
}

export const handleGameOver = async (gameId, gameData, games, io, overrideReason, overrideWinnerColor) => {
  if (gameData.finished) return
  gameData.finished = true

  stopTimer(gameId, games)

  let result = 'draw'
  let reason = overrideReason || 'draw'
  let winner = null

  if (overrideWinnerColor) {
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
  } else if (gameData.game.isDrawByFiftyMoves()) {
    reason = 'fifty-move-rule'
  }

  const whiteName = await getPlayerName(gameData.white)
  const blackName = await getPlayerName(gameData.black)

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

  // Cleanup: remove game from memory after 60 seconds to allow late reconnects
  setTimeout(() => games.delete(gameId), 60000)
}
