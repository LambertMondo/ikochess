import express from 'express'
import { supabase, ensurePlayer } from './db.js'

export const setupRoutes = (app, games, players) => {
  // ── Create challenge (called by Telegram bot plugin) ──
  app.post('/api/challenge', async (req, res) => {
    const { challengerId, challengerName, groupChatId, isAiGame, aiDifficulty } = req.body
    
    // Check if player has an active pending challenge in this group to avoid spam
    // (Optional enhancement, left out for brevity unless requested)

    const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await ensurePlayer(challengerId, challengerName)

    const { error } = await supabase.from('chess_challenges').insert({
      game_id: gameId, 
      challenger_id: challengerId, 
      challenger_name: challengerName,
      group_chat_id: groupChatId, 
      is_ai_game: isAiGame || false,
      ai_difficulty: aiDifficulty || 'medium', 
      status: 'pending'
    })

    if (error) return res.status(500).json({ error: error.message })
    res.json({ gameId })
  })

  // ── Accept challenge (called by Telegram bot plugin) ──
  app.post('/api/challenge/:gameId/accept', async (req, res) => {
    const { opponentId, opponentName } = req.body
    const { gameId } = req.params

    const { data: challenge, error: fetchErr } = await supabase
      .from('chess_challenges')
      .select('*')
      .eq('game_id', gameId)
      .single()

    if (fetchErr || !challenge) {
      return res.status(404).json({ error: 'Challenge not found' })
    }

    // Checking expiration (New Feature 2.6)
    // If the challenge is older than 30 minutes and hasn't started yet, mark it expired.
    const createdTime = new Date(challenge.created_at).getTime()
    const now = Date.now()
    if (now - createdTime > 30 * 60 * 1000 && challenge.status === 'pending') {
       await supabase.from('chess_challenges').update({ status: 'expired' }).eq('game_id', gameId)
       return res.status(400).json({ error: 'Challenge expired', isExpired: true })
    }

    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: 'Challenge already accepted, expired, or finished' })
    }

    if (challenge.challenger_id === opponentId) {
      return res.status(400).json({ error: 'Cannot accept your own challenge' })
    }

    await ensurePlayer(opponentId, opponentName)

    const { error } = await supabase.from('chess_challenges').update({
      opponent_id: opponentId, 
      opponent_name: opponentName, 
      status: 'accepted'
    }).eq('game_id', gameId)

    if (error) return res.status(500).json({ error: error.message })
    
    res.json({ 
      success: true, 
      challenge: { ...challenge, opponent_id: opponentId, opponent_name: opponentName } 
    })
  })

  // ── Get challenge info ──
  app.get('/api/challenge/:gameId', async (req, res) => {
    const { data, error } = await supabase
      .from('chess_challenges')
      .select('*')
      .eq('game_id', req.params.gameId)
      .single()
      
    if (error) return res.status(404).json({ error: 'Challenge not found' })

    const createdTime = new Date(data.created_at).getTime()
    const now = Date.now()
    if (now - createdTime > 30 * 60 * 1000 && data.status === 'pending') {
       await supabase.from('chess_challenges').update({ status: 'expired' }).eq('game_id', req.params.gameId)
       data.status = 'expired'
    }

    res.json(data)
  })

  // ── Rankings ──
  app.get('/api/rankings', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('telegram_id, username, elo, score, games_played, games_won, games_lost, games_drawn')
        .order('score', { ascending: false })
        .limit(50)
      if (error) throw error
      res.json(data)
    } catch (error) { 
      res.status(500).json({ error: error.message }) 
    }
  })

  // ── Active game state ──
  app.get('/api/game/:gameId', (req, res) => {
    const gameData = games.get(req.params.gameId)
    if (!gameData) return res.status(404).json({ error: 'Game not found' })
    
    res.json({
      gameId: req.params.gameId, 
      fen: gameData.game.fen(), 
      moves: gameData.moves,
      white: gameData.white, 
      black: gameData.black,
      turn: gameData.game.turn() === 'w' ? 'white' : 'black',
      isAiGame: gameData.isAiGame, 
      timers: gameData.timers,
      ready: gameData.ready
    })
  })
}
