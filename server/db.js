import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

export const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://hhuwvivukaddykhxwtdu.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ''
)

export const AI_PLAYER_ID = 'AI_OPENCLAW'

// ── Title system ──
const TITLE_THRESHOLDS = [
  { min: 1800, title: 'Légende',       icon: '👑' },
  { min: 1600, title: 'Grand Maître',  icon: '♚' },
  { min: 1400, title: 'Maître',        icon: '♛' },
  { min: 1200, title: 'Expert',        icon: '♜' },
  { min: 1000, title: 'Joueur',        icon: '♝' },
  { min: 800,  title: 'Amateur',       icon: '♞' },
  { min: 0,    title: 'Novice',        icon: '♟' }
]

export const getTitleFromElo = (elo) => {
  for (const t of TITLE_THRESHOLDS) {
    if (elo >= t.min) return t
  }
  return TITLE_THRESHOLDS[TITLE_THRESHOLDS.length - 1]
}

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
      .select('elo, score, games_played, games_won, games_lost, games_drawn, win_streak, best_streak')
      .eq('telegram_id', telegramId).single()
    
    if (fetchErr || !player) return

    // Scoring: Win=3, Draw=1, Loss=0
    const scoreAdd = result === 'win' ? 3 : result === 'draw' ? 1 : 0

    // Streak tracking
    let newStreak = result === 'win' ? (player.win_streak || 0) + 1 : 0
    let bestStreak = Math.max(player.best_streak || 0, newStreak)

    // New ELO and title
    const newElo = Math.max(100, player.elo + eloChange)
    const { title } = getTitleFromElo(newElo)

    const updates = {
      elo: newElo,
      title,
      score: (player.score || 0) + scoreAdd,
      games_played: player.games_played + 1,
      games_won: player.games_won + (result === 'win' ? 1 : 0),
      games_lost: player.games_lost + (result === 'loss' ? 1 : 0),
      games_drawn: player.games_drawn + (result === 'draw' ? 1 : 0),
      win_streak: newStreak,
      best_streak: bestStreak,
      updated_at: new Date().toISOString()
    }
    await supabase.from('players').update(updates).eq('telegram_id', telegramId)
  } catch (err) {
    console.error('Stats update error:', err)
  }
}

// ── Player Profile ──
export const getPlayerProfile = async (telegramId) => {
  if (telegramId === AI_PLAYER_ID) return null
  try {
    const { data: player } = await supabase
      .from('players')
      .select('telegram_id, username, elo, title, score, games_played, games_won, games_lost, games_drawn, win_streak, best_streak, created_at')
      .eq('telegram_id', telegramId)
      .single()

    if (!player) return null

    const titleInfo = getTitleFromElo(player.elo)
    const winRate = player.games_played > 0
      ? Math.round((player.games_won / player.games_played) * 100)
      : 0

    // Last 10 games
    const { data: recentGames } = await supabase
      .from('games')
      .select('game_id, white_player_id, black_player_id, winner_id, result, reason, ended_at')
      .or(`white_player_id.eq.${telegramId},black_player_id.eq.${telegramId}`)
      .order('ended_at', { ascending: false })
      .limit(10)

    // Season history
    const { data: seasons } = await supabase
      .from('season_history')
      .select('*')
      .eq('player_id', telegramId)
      .order('season', { ascending: false })

    return {
      ...player,
      titleIcon: titleInfo.icon,
      winRate,
      recentGames: recentGames || [],
      seasons: seasons || []
    }
  } catch (err) {
    console.error('Get profile error:', err)
    return null
  }
}

// ── Leaderboard ──
export const getLeaderboard = async (limit = 20) => {
  try {
    const { data } = await supabase
      .from('players')
      .select('telegram_id, username, elo, title, games_played, games_won')
      .order('elo', { ascending: false })
      .limit(limit)

    return (data || []).map((p, i) => ({
      ...p,
      rank: i + 1,
      titleIcon: getTitleFromElo(p.elo).icon
    }))
  } catch (err) {
    console.error('Leaderboard error:', err)
    return []
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
