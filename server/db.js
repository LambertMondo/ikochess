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

// ── Clans & Groups (Sprint 3) ──
export const setPlayerClan = async (telegramId, groupId) => {
  try {
    const { data: group } = await supabase.from('groups').select('id').eq('id', groupId).single()
    if (!group) return { success: false, error: 'Groupe introuvable.' }

    const { data: player } = await supabase.from('players').select('clan_changed_at').eq('telegram_id', telegramId).single()
    if (player?.clan_changed_at) {
      const changedTime = new Date(player.clan_changed_at).getTime()
      if (Date.now() - changedTime < 90 * 24 * 60 * 60 * 1000) {
        return { success: false, error: 'Tu as déjà changé de clan récemment. Reviens dans 90 jours.' }
      }
    }

    await supabase.from('players').update({ 
      clan_group_id: groupId, 
      clan_changed_at: new Date().toISOString() 
    }).eq('telegram_id', telegramId)

    return { success: true }
  } catch (err) {
    console.error('setPlayerClan error:', err)
    return { success: false, error: err.message }
  }
}

export const getClanRankings = async (limit = 20) => {
  try {
    const { data } = await supabase
      .from('groups')
      .select('id, name, group_elo, wars_won, total_wars')
      .order('group_elo', { ascending: false })
      .limit(limit)
    return data || []
  } catch (err) {
    console.error('getClanRankings error:', err)
    return []
  }
}

export const getClanMembers = async (groupId) => {
  try {
    const { data } = await supabase
      .from('players')
      .select('telegram_id, username, elo, title')
      .eq('clan_group_id', groupId)
      .order('elo', { ascending: false })
    return data || []
  } catch (err) {
    console.error('getClanMembers error:', err)
    return []
  }
}

// ── Tournaments (Sprint 3) ──
export const createTournament = async (groupId, name, format = 'elimination', maxPlayers = 8) => {
  try {
    const { data, error } = await supabase.from('tournaments').insert({
      group_id: groupId,
      name,
      format,
      max_players: maxPlayers,
      status: 'registration'
    }).select('id').single()
    if (error) throw error
    return { success: true, tournamentId: data.id }
  } catch (err) {
    console.error('createTournament error:', err)
    return { success: false, error: err.message }
  }
}

export const joinTournament = async (tournamentId, telegramId) => {
  try {
    await ensurePlayer(telegramId)
    const { data: t } = await supabase.from('tournaments')
      .select('status, max_players').eq('id', tournamentId).single()
    
    if (!t || t.status !== 'registration') return { success: false, error: 'Tournoi fermé ou introuvable.' }

    const { count } = await supabase.from('tournament_participants')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)

    if (count >= t.max_players) return { success: false, error: 'Le tournoi est plein.' }

    const { error } = await supabase.from('tournament_participants')
      .insert({ tournament_id: tournamentId, player_id: telegramId })
      
    if (error) {
      if (error.code === '23505') return { success: false, error: 'Tu es déjà inscrit à ce tournoi.' }
      throw error
    }
    return { success: true }
  } catch (err) {
    console.error('joinTournament error:', err)
    return { success: false, error: err.message }
  }
}

export const getActiveTournaments = async (groupId) => {
  try {
    let query = supabase.from('tournaments').select('*').in('status', ['registration', 'active'])
    if (groupId) query = query.eq('group_id', groupId)
    const { data } = await query
    return data || []
  } catch (err) {
    console.error('getActiveTournaments error:', err)
    return []
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

// ── Themes ──
export const getThemes = async (telegramId) => {
  try {
    const { data: allThemes } = await supabase
      .from('themes')
      .select('*')
      .order('sort_order', { ascending: true })

    const { data: unlocked } = await supabase
      .from('player_themes')
      .select('theme_id')
      .eq('player_id', telegramId)

    const { data: player } = await supabase
      .from('players')
      .select('active_theme')
      .eq('telegram_id', telegramId)
      .single()

    const unlockedSet = new Set((unlocked || []).map(u => u.theme_id))

    return (allThemes || []).map(t => ({
      ...t,
      unlocked: unlockedSet.has(t.id),
      active: player?.active_theme === t.id
    }))
  } catch (err) {
    console.error('Get themes error:', err)
    return []
  }
}

export const getPlayerActiveTheme = async (telegramId) => {
  try {
    const { data: player } = await supabase
      .from('players')
      .select('active_theme')
      .eq('telegram_id', telegramId)
      .single()

    const themeId = player?.active_theme || 'telegram-blue'
    const { data: theme } = await supabase
      .from('themes')
      .select('*')
      .eq('id', themeId)
      .single()

    return theme || { id: 'telegram-blue', light_color: '#6490b1', dark_color: '#2b5278' }
  } catch {
    return { id: 'telegram-blue', light_color: '#6490b1', dark_color: '#2b5278' }
  }
}

export const setActiveTheme = async (telegramId, themeId) => {
  try {
    // Check if player has unlocked this theme
    const { data: unlock } = await supabase
      .from('player_themes')
      .select('theme_id')
      .eq('player_id', telegramId)
      .eq('theme_id', themeId)
      .single()

    if (!unlock) return { success: false, error: 'Thème non débloqué' }

    await supabase
      .from('players')
      .update({ active_theme: themeId })
      .eq('telegram_id', telegramId)

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export const checkAndUnlockThemes = async (telegramId) => {
  try {
    const { data: player } = await supabase
      .from('players')
      .select('elo, games_won')
      .eq('telegram_id', telegramId)
      .single()

    if (!player) return []

    const { data: allThemes } = await supabase
      .from('themes')
      .select('id, unlock_condition')

    const { data: alreadyUnlocked } = await supabase
      .from('player_themes')
      .select('theme_id')
      .eq('player_id', telegramId)

    const unlockedSet = new Set((alreadyUnlocked || []).map(u => u.theme_id))
    const newUnlocks = []

    for (const t of (allThemes || [])) {
      if (unlockedSet.has(t.id)) continue
      const [type, val] = (t.unlock_condition || 'free').split(':')
      let earned = false
      if (type === 'free') earned = true
      else if (type === 'elo' && player.elo >= parseInt(val)) earned = true
      else if (type === 'wins' && player.games_won >= parseInt(val)) earned = true

      if (earned) {
        await supabase.from('player_themes').insert({ player_id: telegramId, theme_id: t.id })
        newUnlocks.push(t.id)
      }
    }
    return newUnlocks
  } catch (err) {
    console.error('Unlock themes error:', err)
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
