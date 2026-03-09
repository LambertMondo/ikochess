import { useState, useEffect, useCallback, useRef } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'
const socket = io(SERVER_URL)

const EMOJIS = ['😤', '🔥', '😎', '🤔', '💀', '👏']

// Format milliseconds to mm:ss
const formatTime = (ms) => {
  if (ms == null) return '--:--'
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function App() {
  const [game, setGame] = useState(new Chess())
  const [playerColor, setPlayerColor] = useState('white')
  const [gameStatus, setGameStatus] = useState('connecting')
  const [moveHistory, setMoveHistory] = useState([])
  const [gameId, setGameId] = useState(null)
  const [telegramId, setTelegramId] = useState(null)
  const [playerNames, setPlayerNames] = useState({ white: '', black: '' })
  const [message, setMessage] = useState('')
  const [gameOverData, setGameOverData] = useState(null)
  const [isAiGame, setIsAiGame] = useState(false)
  const [aiDifficulty, setAiDifficulty] = useState('medium')

  // New feature states
  const [timers, setTimers] = useState({ white: null, black: null })
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [legalMoves, setLegalMoves] = useState([])
  const [drawOfferPending, setDrawOfferPending] = useState(false)
  const [drawOfferFrom, setDrawOfferFrom] = useState(null)
  const [floatingEmoji, setFloatingEmoji] = useState(null)
  const [isSpectator, setIsSpectator] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [leaderboardData, setLeaderboardData] = useState([])
  const [confirmResign, setConfirmResign] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const emojiTimeoutRef = useRef(null)

  // Parse URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tgId = params.get('player')
    const urlGameId = params.get('game')
    const watchGameId = params.get('watch')

    if (tgId) {
      setTelegramId(tgId)
      localStorage.setItem('telegram_id', tgId)
    } else {
      const storedId = localStorage.getItem('telegram_id')
      if (storedId) setTelegramId(storedId)
    }

    if (watchGameId) {
      setGameId(watchGameId)
      setIsSpectator(true)
      setGameStatus('spectating')
    } else if (urlGameId) {
      setGameId(urlGameId)
    }
  }, [])

  // Join game or spectate
  useEffect(() => {
    if (isSpectator && gameId && gameStatus === 'spectating') {
      socket.emit('join-spectate', { gameId })
      return
    }
    if (telegramId && gameId && gameStatus === 'connecting') {
      setGameStatus('waiting')
      setMessage('Connexion à la partie...')
      socket.emit('join-challenge', { gameId, telegramId })
    }
  }, [telegramId, gameId, gameStatus, isSpectator])

  // Fetch leaderboard
  useEffect(() => {
    if (!gameId && !isSpectator) {
      fetch(`${SERVER_URL}/api/rankings`)
        .then(r => r.json()).then(data => {
          if (Array.isArray(data)) setLeaderboardData(data)
        }).catch(() => {})
      setShowLeaderboard(true)
    }
  }, [gameId, isSpectator])

  // Socket event listeners
  useEffect(() => {
    socket.on('game-started', ({ gameId: id, color, white, black, whiteName, blackName, fen, isAiGame: ai, aiDifficulty: diff, timers: t }) => {
      setGameId(id)
      setPlayerColor(color)
      setPlayerNames({ white: whiteName || white, black: blackName || black })
      setIsAiGame(ai || false)
      setAiDifficulty(diff || 'medium')
      if (t) setTimers(t)
      if (fen) {
        const g = new Chess(fen)
        setGame(g)
        const currentTurn = g.turn() === 'w' ? 'white' : 'black'
        setGameStatus(currentTurn === color ? 'your-turn' : 'opponent-turn')
      } else {
        setGameStatus(color === 'white' ? 'your-turn' : 'opponent-turn')
      }
      setMessage(color === 'white' ? 'C\'est votre tour !' : ai ? 'L\'IA réfléchit...' : 'En attente de l\'adversaire...')
    })

    socket.on('spectate-started', ({ gameId: id, whiteName, blackName, fen, isAiGame: ai, aiDifficulty: diff, timers: t, moveHistory: mh }) => {
      setGameId(id)
      setPlayerNames({ white: whiteName, black: blackName })
      setIsAiGame(ai || false)
      setAiDifficulty(diff || 'medium')
      if (t) setTimers(t)
      if (fen) setGame(new Chess(fen))
      if (mh) setMoveHistory(mh)
      setGameStatus('spectating')
    })

    socket.on('opponent-move', ({ move, fen }) => {
      const newGame = new Chess(fen)
      setGame(newGame)
      setMoveHistory(prev => [...prev, move])
      if (!isSpectator) {
        setGameStatus('your-turn')
        setMessage('C\'est votre tour !')
      }
      setSelectedSquare(null)
      setLegalMoves([])
    })

    socket.on('timer-update', (t) => setTimers(t))

    socket.on('game-over', (data) => {
      setGameStatus('finished')
      setGameOverData(data)
    })

    socket.on('draw-offered', ({ from }) => {
      setDrawOfferFrom(from)
      setDrawOfferPending(true)
    })

    socket.on('draw-declined', () => {
      setDrawOfferPending(false)
      setDrawOfferFrom(null)
    })

    socket.on('emoji-received', ({ emoji }) => {
      showFloatingEmoji(emoji)
    })

    socket.on('error', ({ message: msg }) => setMessage(`❌ ${msg}`))

    return () => {
      socket.off('game-started')
      socket.off('spectate-started')
      socket.off('opponent-move')
      socket.off('timer-update')
      socket.off('game-over')
      socket.off('draw-offered')
      socket.off('draw-declined')
      socket.off('emoji-received')
      socket.off('error')
    }
  }, [isSpectator])

  // Floating emoji animation
  const showFloatingEmoji = (emoji) => {
    setFloatingEmoji(emoji)
    if (emojiTimeoutRef.current) clearTimeout(emojiTimeoutRef.current)
    emojiTimeoutRef.current = setTimeout(() => setFloatingEmoji(null), 2500)
  }

  // ── Tap-to-Move ──
  const onSquareClick = useCallback((square) => {
    if (gameStatus !== 'your-turn' || isSpectator) return

    const piece = game.get(square)

    if (selectedSquare) {
      // Attempt to move to clicked square
      if (legalMoves.some(m => m.to === square)) {
        // Check for promotion
        const isPromotion = piece === null &&
          game.get(selectedSquare)?.type === 'p' &&
          ((playerColor === 'white' && square[1] === '8') || (playerColor === 'black' && square[1] === '1'))

        const move = { from: selectedSquare, to: square, promotion: isPromotion ? 'q' : undefined }
        const newGame = new Chess(game.fen())
        const result = newGame.move(move)

        if (result) {
          setGame(newGame)
          setMoveHistory(prev => [...prev, result])
          socket.emit('make-move', { gameId, move: result })

          if (newGame.isGameOver()) {
            setGameStatus('finished')
          } else {
            setGameStatus('opponent-turn')
            setMessage(isAiGame ? '🤖 L\'IA réfléchit...' : 'En attente de l\'adversaire...')
          }
        }
        setSelectedSquare(null)
        setLegalMoves([])
        return
      }

      // Clicking same square = deselect
      if (square === selectedSquare) {
        setSelectedSquare(null)
        setLegalMoves([])
        return
      }
    }

    // Select a piece (must be own piece)
    if (piece && piece.color === (playerColor === 'white' ? 'w' : 'b')) {
      setSelectedSquare(square)
      const moves = game.moves({ square, verbose: true })
      setLegalMoves(moves)
    } else {
      setSelectedSquare(null)
      setLegalMoves([])
    }
  }, [game, gameId, gameStatus, playerColor, selectedSquare, legalMoves, isAiGame, isSpectator])

  // Make a move (drag-and-drop)
  const onDrop = useCallback((sourceSquare, targetSquare) => {
    if (gameStatus !== 'your-turn' || isSpectator) return false

    try {
      const move = { from: sourceSquare, to: targetSquare, promotion: 'q' }
      const newGame = new Chess(game.fen())
      const result = newGame.move(move)
      if (!result) return false

      setGame(newGame)
      setMoveHistory(prev => [...prev, result])
      socket.emit('make-move', { gameId, move: result })

      if (newGame.isGameOver()) {
        setGameStatus('finished')
      } else {
        setGameStatus('opponent-turn')
        setMessage(isAiGame ? '🤖 L\'IA réfléchit...' : 'En attente de l\'adversaire...')
      }
      setSelectedSquare(null)
      setLegalMoves([])
      return true
    } catch {
      return false
    }
  }, [game, gameId, gameStatus, isAiGame, isSpectator])

  // Custom square styles for tap-to-move
  const customSquareStyles = {}
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' }
    legalMoves.forEach(move => {
      const targetPiece = game.get(move.to)
      customSquareStyles[move.to] = targetPiece
        ? { background: 'radial-gradient(circle, rgba(239,68,68,0.5) 85%, transparent 85%)', borderRadius: '50%' }
        : { background: 'radial-gradient(circle, rgba(0,0,0,0.25) 25%, transparent 25%)', borderRadius: '50%' }
    })
  }

  // Get player initial
  const getInitial = (name) => {
    if (!name) return '?'
    if (name === 'OpenClaw AI') return '🤖'
    return name.charAt(0).toUpperCase()
  }

  // ── Actions ──
  const handleResign = () => {
    if (confirmResign) {
      socket.emit('resign', { gameId })
      setConfirmResign(false)
    } else {
      setConfirmResign(true)
      setTimeout(() => setConfirmResign(false), 3000)
    }
  }

  const handleOfferDraw = () => {
    socket.emit('offer-draw', { gameId })
    setMessage('🤝 Proposition de nulle envoyée...')
  }

  const handleAcceptDraw = () => {
    socket.emit('accept-draw', { gameId })
    setDrawOfferPending(false)
  }

  const handleDeclineDraw = () => {
    socket.emit('decline-draw', { gameId })
    setDrawOfferPending(false)
    setDrawOfferFrom(null)
  }

  const handleSendEmoji = (emoji) => {
    socket.emit('send-emoji', { gameId, emoji })
    showFloatingEmoji(emoji)
    setShowEmojiPicker(false)
  }

  // Player badge component with timer + emoji
  const PlayerBadge = ({ name, color, isActive, timer, isMe }) => (
    <div className={`player-badge ${isActive ? 'active' : ''} ${color}`}>
      <div className="player-initial">{getInitial(name)}</div>
      <div className="player-info">
        <span className="player-name">{name || 'Joueur'}</span>
      </div>
      {timer != null && (
        <div className={`player-timer ${timer < 30000 ? 'danger' : timer < 60000 ? 'warning' : ''}`}>
          {formatTime(timer)}
        </div>
      )}
      {isMe && !isSpectator && gameStatus !== 'finished' && (
        <button
          className="emoji-trigger"
          onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker) }}
          title="Envoyer un emoji"
        >💬</button>
      )}
      <div className={`piece-color ${color}`}>{color === 'white' ? '♔' : '♚'}</div>
    </div>
  )

  // Game Over overlay
  const GameOverOverlay = () => {
    if (!gameOverData) return null
    const { result, reason, whiteName, blackName, whiteElo, blackElo, whiteChange, blackChange } = gameOverData
    const isDraw = result === 'draw'
    const myColor = playerColor
    const iWon = (result === 'white-wins' && myColor === 'white') || (result === 'black-wins' && myColor === 'black')

    const reasonLabels = {
      'checkmate': 'Échec et mat',
      'stalemate': 'Pat',
      'resignation': 'Abandon',
      'timeout': 'Temps écoulé',
      'agreement': 'Accord mutuel',
      'threefold-repetition': 'Triple répétition',
      'insufficient-material': 'Matériel insuffisant'
    }

    return (
      <div className="game-over-overlay">
        <div className="game-over-card">
          <div className="game-over-icon">
            {isDraw ? '🤝' : isSpectator ? '🏁' : iWon ? '🏆' : '😔'}
          </div>
          <h2>
            {isSpectator ? 'Partie terminée !' : isDraw ? 'Match nul !' : iWon ? 'Victoire !' : 'Défaite...'}
          </h2>
          <p className="game-over-reason">{reasonLabels[reason] || reason}</p>

          <div className="elo-results">
            <div className="elo-row">
              <span>{getInitial(whiteName)} {whiteName}</span>
              <span className={`elo-change ${whiteChange >= 0 ? 'positive' : 'negative'}`}>
                {whiteElo} ({whiteChange >= 0 ? '+' : ''}{whiteChange})
              </span>
            </div>
            <div className="elo-row">
              <span>{getInitial(blackName)} {blackName}</span>
              <span className={`elo-change ${blackChange >= 0 ? 'positive' : 'negative'}`}>
                {blackElo} ({blackChange >= 0 ? '+' : ''}{blackChange})
              </span>
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => window.close()}>Fermer</button>
        </div>
      </div>
    )
  }

  // Leaderboard component
  const Leaderboard = () => (
    <div className="leaderboard">
      <h3 className="leaderboard-title">🏆 Classement</h3>
      {leaderboardData.length === 0 ? (
        <p className="leaderboard-empty">Aucun joueur pour le moment</p>
      ) : (
        <div className="leaderboard-list">
          {leaderboardData.map((p, i) => {
            const medals = ['🥇', '🥈', '🥉']
            const isMe = p.telegram_id === telegramId
            const winRate = p.games_played > 0 ? Math.round((p.games_won / p.games_played) * 100) : 0
            return (
              <div key={p.telegram_id} className={`leaderboard-row ${isMe ? 'is-me' : ''}`}>
                <div className="lb-rank">{medals[i] || `#${i + 1}`}</div>
                <div className="lb-player">
                  <span className="lb-name">{p.username || p.telegram_id}</span>
                  <span className="lb-stats">{p.games_won}W {p.games_drawn}D {p.games_lost}L · {winRate}%</span>
                </div>
                <div className="lb-scores">
                  <span className="lb-score">{p.score || 0} pts</span>
                  <span className="lb-elo">{p.elo} ELO</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // Login screen
  if (!telegramId && !isSpectator) {
    return (
      <div className="container">
        <div className="login-prompt">
          <h2>♟️ Chess Arena</h2>
          <p>Lancez une partie depuis Telegram avec <code>/chess</code> ou <code>/chess_ai</code></p>
          {showLeaderboard && <Leaderboard />}
          <div className="login-form">
            <input type="text" placeholder="Telegram ID" id="telegram-input" className="input-field" />
            <button className="btn btn-primary" onClick={() => {
              const input = document.getElementById('telegram-input')
              if (input.value) {
                localStorage.setItem('telegram_id', input.value)
                setTelegramId(input.value)
              }
            }}>Entrer</button>
          </div>
        </div>
      </div>
    )
  }

  // Waiting screen
  if (!isSpectator && (gameStatus === 'connecting' || (gameStatus === 'waiting' && !gameId))) {
    return (
      <div className="container">
        <div className="login-prompt">
          <h2>♟️ Chess Arena</h2>
          <p>Utilisez <code>/chess</code> dans votre groupe Telegram pour lancer une partie !</p>
          {showLeaderboard && <Leaderboard />}
          <div className="spinner"></div>
        </div>
      </div>
    )
  }

  // Determine active player
  const currentTurn = game.turn() === 'w' ? 'white' : 'black'
  const topPlayer = playerColor === 'white' ? 'black' : 'white'
  const bottomPlayer = playerColor
  const isPlaying = gameStatus === 'your-turn' || gameStatus === 'opponent-turn'

  return (
    <div className="container">
      {/* Spectator badge */}
      {isSpectator && (
        <div className="spectator-badge">👀 Mode spectateur</div>
      )}

      {/* Top player */}
      <PlayerBadge
        name={playerNames[topPlayer]}
        color={topPlayer}
        isActive={currentTurn === topPlayer && gameStatus !== 'finished'}
        timer={timers[topPlayer]}
        isMe={false}
      />

      {/* Status bar */}
      <div className="status-bar">
        {isAiGame && <span className="ai-badge">🤖 vs IA ({aiDifficulty})</span>}
        {game.inCheck() && gameStatus !== 'finished' && <span className="check-badge">⚠️ Échec !</span>}
        {gameStatus === 'your-turn' && <span className="turn-indicator yours">Votre tour</span>}
        {gameStatus === 'opponent-turn' && <span className="turn-indicator waiting">{isAiGame ? 'L\'IA réfléchit...' : 'Adversaire...'}</span>}
        {isSpectator && gameStatus === 'spectating' && <span className="turn-indicator waiting">En direct</span>}
      </div>

      {/* Draw offer banner */}
      {drawOfferPending && drawOfferFrom !== playerColor && !isSpectator && (
        <div className="draw-offer-banner">
          <span>🤝 Votre adversaire propose la nulle</span>
          <div className="draw-actions">
            <button className="btn btn-sm btn-accept" onClick={handleAcceptDraw}>Accepter</button>
            <button className="btn btn-sm btn-decline" onClick={handleDeclineDraw}>Refuser</button>
          </div>
        </div>
      )}

      {/* Chessboard */}
      <div className="board-wrapper">
        {/* Floating emoji */}
        {floatingEmoji && (
          <div className="emoji-float" key={Date.now()}>{floatingEmoji}</div>
        )}
        <Chessboard
          position={game.fen()}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick}
          boardOrientation={isSpectator ? 'white' : playerColor}
          animationDuration={200}
          boardWidth={Math.min(window.innerWidth - 32, 480)}
          customDarkSquareStyle={{ backgroundColor: '#779556' }}
          customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
          arePiecesDraggable={gameStatus === 'your-turn' && !isSpectator}
          customSquareStyles={customSquareStyles}
        />
      </div>

      {/* Bottom player */}
      <PlayerBadge
        name={playerNames[bottomPlayer]}
        color={bottomPlayer}
        isActive={currentTurn === bottomPlayer && gameStatus !== 'finished'}
        timer={timers[bottomPlayer]}
        isMe={!isSpectator}
      />

      {/* Emoji picker */}
      {showEmojiPicker && !isSpectator && (
        <div className="emoji-picker">
          {EMOJIS.map(e => (
            <button key={e} className="emoji-btn" onClick={() => handleSendEmoji(e)}>{e}</button>
          ))}
        </div>
      )}

      {/* Game actions (resign + draw) */}
      {isPlaying && !isSpectator && (
        <div className="game-actions">
          <button
            className={`btn btn-action ${confirmResign ? 'btn-danger-confirm' : 'btn-danger'}`}
            onClick={handleResign}
          >
            {confirmResign ? '⚠️ Confirmer ?' : '🏳️ Abandonner'}
          </button>
          {!isAiGame && (
            <button className="btn btn-action btn-secondary" onClick={handleOfferDraw} disabled={drawOfferPending}>
              🤝 Nulle
            </button>
          )}
        </div>
      )}

      {/* Move history */}
      {moveHistory.length > 0 && (
        <div className="move-history">
          <div className="moves-scroll">
            {moveHistory.map((move, i) => (
              <span key={i} className="move-chip">
                {i % 2 === 0 ? `${Math.floor(i/2)+1}. ` : ''}{move.san || move}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Game Over */}
      {gameStatus === 'finished' && <GameOverOverlay />}
    </div>
  )
}

export default App
