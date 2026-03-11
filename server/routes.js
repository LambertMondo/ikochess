import express from 'express'
import { supabase, ensurePlayer, setPlayerClan, getClanRankings, getClanMembers, createTournament, joinTournament, getActiveTournaments } from './db.js'

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

  // ── Sprint 3: Clan Wars & Groups ──
  app.post('/api/setclan', async (req, res) => {
    const { telegramId, groupId, groupName } = req.body
    
    // Ensure player exists
    await ensurePlayer(telegramId)

    // Ensure group exists in Supabase (OpenClaw should have it, but just in case)
    const { data: existingGroup } = await supabase.from('groups').select('id').eq('id', groupId).single()
    if (!existingGroup && groupName) {
      await supabase.from('groups').insert({ id: groupId, name: groupName })
    }

    const result = await setPlayerClan(telegramId, groupId)
    if (!result.success) return res.status(400).json({ error: result.error })
    res.json({ success: true, message: 'Clan mis à jour avec succès.' })
  })

  app.get('/api/groups/rankings', async (req, res) => {
    const rankings = await getClanRankings(20)
    res.json(rankings)
  })

  app.get('/api/groups/:groupId/members', async (req, res) => {
    const members = await getClanMembers(req.params.groupId)
    res.json(members)
  })

  // ── Sprint 3: Tournois ──
  app.post('/api/tournaments', async (req, res) => {
    const { groupId, name, format, maxPlayers } = req.body
    if (!groupId || !name) return res.status(400).json({ error: 'groupId et name requis' })
    const result = await createTournament(groupId, name, format, maxPlayers)
    if (!result.success) return res.status(500).json({ error: result.error })
    res.json(result)
  })

  app.get('/api/tournaments', async (req, res) => {
    const { groupId } = req.query
    const tournaments = await getActiveTournaments(groupId)
    res.json(tournaments)
  })

  app.post('/api/tournaments/:id/join', async (req, res) => {
    const { telegramId } = req.body
    if (!telegramId) return res.status(400).json({ error: 'telegramId requis' })
    const result = await joinTournament(req.params.id, telegramId)
    if (!result.success) return res.status(400).json({ error: result.error })
    res.json({ success: true, message: 'Inscription réussie.' })
  })
}
