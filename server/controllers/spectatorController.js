import { getPlayerName } from '../db.js'

export const registerSpectatorHandlers = (io, socket, games, spectators) => {
  socket.on('join-spectate', async ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData) {
      socket.emit('error', { message: 'Game not found' })
      return
    }

    socket.join(gameId)

    if (!spectators.has(gameId)) spectators.set(gameId, new Set())
    spectators.get(gameId).add(socket.id)
    
    const newCount = spectators.get(gameId).size
    io.to(gameId).emit('spectator-count', { count: newCount })

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
      moveHistory: gameData.moves,
      ready: gameData.ready
    })
  })
}
