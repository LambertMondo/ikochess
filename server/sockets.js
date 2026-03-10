import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import { registerGameHandlers } from './controllers/gameController.js'
import { registerSpectatorHandlers } from './controllers/spectatorController.js'
import { registerChatHandlers } from './controllers/chatController.js'

export const setupSockets = async (io, games, players, spectators) => {

  // Optional: Redis Pub/Sub Adapter for Horizontal Scaling
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL })
      const subClient = pubClient.duplicate()
      await Promise.all([pubClient.connect(), subClient.connect()])
      io.adapter(createAdapter(pubClient, subClient))
      console.log('🔗 Redis Adapter Connected for Socket.io')
    } catch (err) {
      console.error('Redis Adapter Connection Failed, falling back to in-memory:', err)
    }
  }

  io.on('connection', (socket) => {
    console.log('Player/Spectator connected:', socket.id)

    // Register modular controllers
    registerGameHandlers(io, socket, games, players)
    registerSpectatorHandlers(io, socket, games, spectators)
    registerChatHandlers(io, socket, games)

    // ── Disconnect ──
    socket.on('disconnect', () => {
      for (const [telegramId, socketId] of players.entries()) {
        if (socketId === socket.id) { 
          players.delete(telegramId)
          break 
        }
      }
      for (const [gId, specSet] of spectators.entries()) {
        if (specSet.has(socket.id)) {
          specSet.delete(socket.id)
          io.to(gId).emit('spectator-count', { count: specSet.size })
          if (specSet.size === 0) spectators.delete(gId)
        }
      }
    })
  })
}
