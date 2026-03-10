import { handleGameOver } from '../game/engine.js'

export const registerChatHandlers = (io, socket, games) => {
  socket.on('offer-draw', ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished || gameData.isAiGame) return

    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'
    if (gameData.drawOffer === playerColor) return

    gameData.drawOffer = playerColor
    socket.to(gameId).emit('draw-offered', { from: playerColor })
  })

  socket.on('accept-draw', async ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished || !gameData.drawOffer) return

    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'
    if (gameData.drawOffer === playerColor) return 

    await handleGameOver(gameId, gameData, games, io, 'agreement', null)
  })

  socket.on('decline-draw', ({ gameId }) => {
    const gameData = games.get(gameId)
    if (!gameData || !gameData.drawOffer) return

    gameData.drawOffer = null
    io.to(gameId).emit('draw-declined', {})
  })

  socket.on('send-emoji', ({ gameId, emoji }) => {
    const gameData = games.get(gameId)
    if (!gameData || gameData.finished) return

    const playerColor = gameData.white === socket.telegramId ? 'white' : 'black'
    const allowedEmojis = ['👍', '👎', '🤬', '👏', '😂', '🔥', '🤔', '💀', '😤', '😎']
    if (!allowedEmojis.includes(emoji)) return

    socket.to(gameId).emit('emoji', { emoji, color: playerColor })
  })
}
