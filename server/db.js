import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

export const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://hhuwvivukaddykhxwtdu.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ''
)

export const AI_PLAYER_ID = 'AI_OPENCLAW'

export const ensurePlayer = async (telegramId, username) => {
  if (!telegramId || telegramId === AI_PLAYER_ID) return
  try {
    const { error } = await supabase
      .from('players')
      .upsert(
        { telegram_id: telegramId, username: username || telegramId, updated_at: new Date().toISOString() },
        { onConflict: 'telegram_id', ignoreDuplicates: true }
      )
    if (error) console.error('Error ensuring player:', error)
  } catch (err) {
    console.error('Ensure player error:', err)
  }
}

export const getPlayerElo = async (telegramId) => {
  if (telegramId === AI_PLAYER_ID) return 1200
  try {
    const { data } = await supabase.from('players').select('elo').eq('telegram_id', telegramId).single()
    return data?.elo || 1200
  } catch {
    return 1200
  }
}

export const getPlayerName = async (telegramId) => {
  if (telegramId === AI_PLAYER_ID) return 'OpenClaw AI'
  try {
    const { data } = await supabase.from('players').select('username').eq('telegram_id', telegramId).single()
    return data?.username || telegramId
  } catch {
    return telegramId
  }
}

export const updatePlayerStats = async (telegramId, eloChange, result) => {
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
  } catch (err) {
    console.error('Stats update error:', err)
  }
}

export const saveGame = async (gameId, gameData, result, reason, winnerId) => {
  try {
    await supabase.from('games').insert({
      game_id: gameId, 
      white_player_id: gameData.white, 
      black_player_id: gameData.black,
      winner_id: winnerId, 
      moves: gameData.moves,
      fen_start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fen_end: gameData.game.fen(), 
      result, 
      reason, 
      ended_at: new Date().toISOString()
    })
  } catch (err) {
    console.error('Save game error:', err)
  }
}
