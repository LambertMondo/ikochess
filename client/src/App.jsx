import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { io } from 'socket.io-client';
import './App.css';

// Components
import { GameOverModal } from './components/GameOverModal';
import { Leaderboard } from './components/Leaderboard';
import { ChessBoardComponent } from './components/ChessBoardComponent';
import { ChatAndSpectator } from './components/ChatAndSpectator';
import { PlayerBadge } from './components/PlayerBadge';
import { GameActions } from './components/GameActions';

const API_URL = import.meta.env.VITE_SERVER_URL || '';

function App() {
  const [socket, setSocket] = useState(null);
  const [game, setGame] = useState(new Chess());
  const [gameId, setGameId] = useState(null);
  
  // Game Setup
  const [myColor, setMyColor] = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [isAiGame, setIsAiGame] = useState(false);
  
  // Players
  const [players, setPlayers] = useState({ white: {}, black: {} });
  
  // Game Status
  // 'connecting', 'waiting', 'your-turn', 'opponent-turn', 'finished'
  const [status, setStatus] = useState('connecting');
  const [playersReady, setPlayersReady] = useState({ white: false, black: false });
  const [liveSpectators, setLiveSpectators] = useState(0);

  const isReady = myColor ? playersReady[myColor] : false;
  const oppColorForReady = myColor === 'white' ? 'black' : (myColor === 'black' ? 'white' : null);
  const isOpponentReady = oppColorForReady ? playersReady[oppColorForReady] : false;
  const isGameFullyReady = (playersReady.white && playersReady.black) || isSpectator;
  
  // Timers
  const [timers, setTimers] = useState({ white: 300000, black: 300000 });
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  
  // UI States
  const [gameOverData, setGameOverData] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeEmojis, setActiveEmojis] = useState({ white: null, black: null });
  const [drawOfferReceived, setDrawOfferReceived] = useState(false);
  const [drawOfferFrom, setDrawOfferFrom] = useState(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [hasGameId, setHasGameId] = useState(false);

  // Sync Timer Reference
  const syncTimerRef = useRef(null);

  // Parse URL Parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('gameId') || params.get('game') || params.get('watch');
    const isWatchMode = params.has('watch');
    const playerJson = params.get('player');

    let playerData = null;
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user) {
      playerData = window.Telegram.WebApp.initDataUnsafe.user;
    }

    if (!playerData && playerJson) {
      try {
        const parsed = JSON.parse(decodeURIComponent(playerJson));
        if (typeof parsed === 'object' && parsed !== null) {
          playerData = parsed;
        } else {
          playerData = { id: String(parsed) };
        }
      } catch(e) { 
        playerData = { id: playerJson };
      }
    }

    if (!gid) {
      setHasGameId(false);
      return;
    }

    setHasGameId(true);

    setGameId(gid);

    // Init Socket
    const newSocket = io(API_URL);
    setSocket(newSocket);

    // Local countdown timer approximation to make the UI look active
    syncTimerRef.current = setInterval(() => {
      setTimers(prev => {
        if (!prev.lastUpdate) return prev;
        const now = Date.now();
        const elapsed = now - prev.lastUpdate;
        // Determine which color's timer is ticking based on game turn
        // We need to read the current game, but since this is in a closure
        // we read it from the ref-like approach of updating functional state
        return { ...prev, lastUpdate: now, _elapsed: elapsed };
      });
    }, 100);

    // Socket Event: Connected
    newSocket.on('connect', () => {
      if (isWatchMode) {
        newSocket.emit('join-spectate', { gameId: gid });
      } else {
        newSocket.emit('join-challenge', { gameId: gid, telegramId: playerData ? playerData.id : null });
      }
    });
    
    // For Spectator Mode Sync
    newSocket.on('spectate-started', (data) => {
      const g = new Chess();
      g.load(data.fen);
      setGame(g);
      
      setPlayers({ 
        white: { id: data.white, name: data.whiteName }, 
        black: { id: data.black, name: data.blackName } 
      });
      
      setIsSpectator(true);
      setMyColor(null);

      setIsAiGame(data.isAiGame);
      setTimers({
        white: data.timers.white,
        black: data.timers.black,
        lastUpdate: Date.now()
      });
      
      if (data.status === 'finished') {
        setStatus('finished');
      } else {
        setStatus(g.turn() === 'w' ? 'opponent-turn' : 'opponent-turn'); // spectator implies no "your-turn"
      }
    });

    // Socket Event: Sync
    newSocket.on('game-started', (data) => {
      const g = new Chess();
      g.load(data.fen);
      setGame(g);
      
      setPlayers({ 
        white: { id: data.white, name: data.whiteName }, 
        black: { id: data.black, name: data.blackName } 
      });
      
      let color = null;
      if (playerData && !isWatchMode) {
        if (String(data.white) === String(playerData.id)) color = 'white';
        else if (String(data.black) === String(playerData.id)) color = 'black';
        else setIsSpectator(true);
        setMyColor(color);
      } else {
        setIsSpectator(true);
      }
      
      // Look for individual readiness
      setPlayersReady(data.ready || { white: false, black: false });

      setIsAiGame(data.isAiGame);
      setTimers({
        white: data.timers.white,
        black: data.timers.black,
        lastUpdate: Date.now()
      });

      if (!data.white || (!data.black && !data.isAiGame)) {
        setStatus('waiting');
      } else if (data.status === 'finished') {
        setStatus('finished');
      } else {
        setStatus(g.turn() === (color === 'white' ? 'w' : 'b') ? 'your-turn' : 'opponent-turn');
      }
    });

    // Ready State Sync Let everyone know
    newSocket.on('player-ready-update', (data) => {
      setPlayersReady(prev => ({ ...prev, [data.color]: data.ready }));
    });

    // Timer Sync
    newSocket.on('timer_sync', (t) => {
      setTimers({ ...t, lastUpdate: Date.now() });
    });

    // Spectator Count
    newSocket.on('spectator-count', (data) => {
      setLiveSpectators(data.count);
    });

    // Move Event
    newSocket.on('opponent-move', (data) => {
      const g = new Chess();
      g.load(data.fen);
      setGame(g);
      setMoveHistory(prev => [...prev, data]);
      setSelectedSquare(null);
      setLegalMoves([]);
      
      setStatus(prevStatus => {
        if (prevStatus === 'finished') return 'finished';
        setMyColor(currentColor => {
          return currentColor; // Just to read it in functional update
        });
        // We can't access latest myColor easily without ref, but wait, we can just use setStatus functional payload!
        // But we still need myColor. Let's compute it from playerData and data?
        // Wait, socket doesn't send players on 'opponent-move'.
        return prevStatus; 
      });
      
      // Let's use a ref or an updater for status based on myColor state.
      setMyColor(currentColor => {
        setStatus(prevStatus => {
          if (prevStatus === 'finished') return 'finished';
          return g.turn() === (currentColor === 'white' ? 'w' : 'b') ? 'your-turn' : 'opponent-turn';
        });
        return currentColor;
      });
    });

    // Emoji Event
    newSocket.on('emoji', (data) => {
      setActiveEmojis(prev => ({ ...prev, [data.color]: data.emoji }));
      setTimeout(() => {
        setActiveEmojis(prev => ({ ...prev, [data.color]: null }));
      }, 3000);
    });

    // Draw Offer Events
    newSocket.on('draw-offered', (data) => {
      setDrawOfferReceived(true);
      setDrawOfferFrom(data.from);
    });

    newSocket.on('draw-declined', () => {
      setDrawOfferReceived(false);
      setDrawOfferFrom(null);
    });

    // Game Ready To Play
    newSocket.on('game-ready-to-play', () => {
      setPlayersReady({ white: true, black: true });
    });

    // Game Over Event
    newSocket.on('game-over', (data) => {
      setStatus('finished');
      // Transform server data into format expected by GameOverModal
      setMyColor(currentColor => {
        const isMyWin = data.result.includes(currentColor || '');
        const isDraw = data.result === 'draw';
        let title, message;
        
        const reasonMap = {
          'checkmate': 'Échec et mat',
          'resignation': 'Abandon',
          'timeout': 'Temps écoulé',
          'stalemate': 'Pat',
          'threefold-repetition': 'Triple répétition',
          'insufficient-material': 'Matériel insuffisant',
          'fifty-move-rule': 'Règle des 50 coups',
          'agreement': 'Accord mutuel',
          'draw': 'Nulle'
        };
        const reasonText = reasonMap[data.reason] || data.reason;
        
        if (isDraw) {
          title = '🤝 Match nul';
          message = reasonText;
        } else if (isMyWin) {
          title = '🏆 Victoire !';
          message = reasonText;
        } else {
          title = '💔 Défaite';
          message = reasonText;
        }
        
        setGameOverData({
          title,
          message,
          players: {
            white: { name: `${data.whiteTitle?.icon || '♟'} ${data.whiteName}` },
            black: { name: `${data.blackTitle?.icon || '♟'} ${data.blackName}` }
          },
          eloChanges: {
            white: { newElo: data.whiteElo, change: data.whiteChange },
            black: { newElo: data.blackElo, change: data.blackChange }
          }
        });
        return currentColor;
      });
    });

    // Error logic
    newSocket.on('error', (err) => {
      alert(err.message || 'Une erreur est survenue');
    });

    return () => {
      clearInterval(syncTimerRef.current);
      newSocket.disconnect();
    };
  }, []);

  const onPieceDrop = (sourceSquare, targetSquare, piece) => {
    if (status !== 'your-turn') return false;
    if (!myColor) return false;

    try {
      // Check if this is a promotion move — if so, return false to let
      // react-chessboard's promotion dialog handle it
      const movingPiece = game.get(sourceSquare);
      if (movingPiece?.type === 'p') {
        const isPromo = (myColor === 'white' && targetSquare[1] === '8') ||
                        (myColor === 'black' && targetSquare[1] === '1');
        if (isPromo) {
          // Store the pending move for onPromotionPieceSelect
          return false; // Let the promotion dialog appear
        }
      }

      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({ from: sourceSquare, to: targetSquare });
      
      if (move === null) return false;
      setGame(gameCopy);
      setStatus('opponent-turn');
      setSelectedSquare(null);
      setLegalMoves([]);
      socket.emit('make-move', { gameId, move: move.san });
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleEmojiSend = (emoji) => {
    if (!myColor || isSpectator) return;
    socket.emit('send-emoji', { gameId, emoji });
    setShowEmojiPicker(false);
  };

  const handleReady = () => {
    socket.emit('player-ready', { gameId });
    if (myColor) setPlayersReady(prev => ({ ...prev, [myColor]: true }));
  };

  // ── Promotion handlers (C1 - FIDE rule) ──
  // Called by react-chessboard to check if a move is a promotion
  const onPromotionCheck = (sourceSquare, targetSquare, piece) => {
    const movingPiece = game.get(sourceSquare);
    if (!movingPiece || movingPiece.type !== 'p') return false;
    return (movingPiece.color === 'w' && targetSquare[1] === '8') ||
           (movingPiece.color === 'b' && targetSquare[1] === '1');
  };

  // Called when user selects a promotion piece from the dialog
  const onPromotionPieceSelect = (piece, promoteFromSquare, promoteToSquare) => {
    if (!piece) return false; // User cancelled
    
    // Extract the piece type from the react-chessboard format (e.g., 'wQ' -> 'q')
    const promotionPiece = piece[1]?.toLowerCase();
    if (!promotionPiece) return false;

    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({
        from: promoteFromSquare,
        to: promoteToSquare,
        promotion: promotionPiece
      });

      if (move === null) return false;
      setGame(gameCopy);
      setStatus('opponent-turn');
      setSelectedSquare(null);
      setLegalMoves([]);
      socket.emit('make-move', { gameId, move: move.san });
      return true;
    } catch (e) {
      return false;
    }
  };

  // ── Tap-to-Move ──
  const onSquareClick = useCallback((square) => {
    if (status !== 'your-turn' || isSpectator || !isGameFullyReady) return;

    const piece = game.get(square);

    if (selectedSquare) {
      if (legalMoves.some(m => m.to === square)) {
        const isPromotion = game.get(selectedSquare)?.type === 'p' &&
          ((myColor === 'white' && square[1] === '8') || (myColor === 'black' && square[1] === '1'));

        const move = { from: selectedSquare, to: square, promotion: isPromotion ? 'q' : undefined };
        const newGame = new Chess(game.fen());
        const result = newGame.move(move);

        if (result) {
          setGame(newGame);
          setSelectedSquare(null);
          setLegalMoves([]);
          setStatus('opponent-turn');
          socket.emit('make-move', { gameId, move: result.san });
        }
        return;
      }

      if (square === selectedSquare) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
    }

    if (piece && piece.color === (myColor === 'white' ? 'w' : 'b')) {
      setSelectedSquare(square);
      const moves = game.moves({ square, verbose: true });
      setLegalMoves(moves);
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  }, [game, gameId, status, myColor, selectedSquare, legalMoves, isSpectator, isGameFullyReady]);

  // Custom square styles for tap-to-move
  const customSquareStyles = {};
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
    legalMoves.forEach(move => {
      const targetPiece = game.get(move.to);
      customSquareStyles[move.to] = targetPiece
        ? { background: 'radial-gradient(circle, rgba(239,68,68,0.5) 85%, transparent 85%)', borderRadius: '50%' }
        : { background: 'radial-gradient(circle, rgba(0,0,0,0.25) 25%, transparent 25%)', borderRadius: '50%' };
    });
  }

  const getOpponentColor = () => myColor === 'white' ? 'black' : 'white';

  const opponentInfo = myColor ? players[getOpponentColor()] : players.black;
  const myInfo = myColor ? players[myColor] : players.white;
  const oppColor = myColor ? getOpponentColor() : 'black';
  const mySide = myColor || 'white';

  // ─── LANDING PAGE (no game params) ───
  if (!hasGameId) {
    return (
      <div className="app-container landing">
        <div className="top-bar">
          <h1 className="app-title">♟️ IkoChess</h1>
        </div>
        <div className="landing-hero">
          <div className="landing-icon">♛</div>
          <h2>Bienvenue sur IkoChess</h2>
          <p>Pour commencer une partie, utilisez la commande <code>/chess</code> dans un groupe Telegram avec le bot <strong>OpenClaw</strong>.</p>
        </div>
        <Leaderboard isOpen={true} onClose={() => {}} embedded={true} />
      </div>
    );
  }

  // ─── GAME VIEW ───
  return (
    <div className="app-container" onClick={() => setShowEmojiPicker(false)}>
      
      <ChatAndSpectator 
        liveSpectators={liveSpectators}
        showLeaderboard={showLeaderboard}
        setShowLeaderboard={setShowLeaderboard}
      />

      {/* Opponent badge - above the board */}
      <PlayerBadge 
        name={opponentInfo?.name} 
        color={oppColor}
        isActive={game.turn() === oppColor.charAt(0)}
        timer={timers[oppColor]}
        isMe={false}
        gameStatus={status}
        fen={game.fen()}
        selectedEmoji={activeEmojis[oppColor]}
      />

      {/* Chess board - fills remaining space */}
      <div className="board-wrapper">
        <ChessBoardComponent 
          game={game}
          fen={game.fen()}
          boardOrientation={myColor || 'white'}
          onPieceDrop={onPieceDrop}
          onSquareClick={onSquareClick}
          customSquareStyles={customSquareStyles}
          isDraggablePiece={({ piece }) => {
            if (!piece) return false;
            if (isSpectator) return false;
            if (!isGameFullyReady) return false;
            if (myColor && piece.charAt(0) !== myColor.charAt(0)) return false;
            if (status !== 'your-turn') return false;
            return true;
          }}
          onPromotionPieceSelect={onPromotionPieceSelect}
          onPromotionCheck={onPromotionCheck}
        />
        
        {status === 'connecting' && <div className="status-text">Connexion au serveur...</div>}
        {status === 'waiting' && <div className="status-text">En attente des joueurs...</div>}
        
        {!isSpectator && status !== 'connecting' && status !== 'waiting' && (
          <>
            {!isReady && <div className="status-text">Veuillez indiquer que vous êtes prêt.</div>}
            {isReady && !isOpponentReady && <div className="status-text">L'adversaire n'est pas prêt.</div>}
            {isGameFullyReady && status === 'your-turn' && <div className="status-text" style={{color: '#43a047'}}>C'est à vous de jouer !</div>}
            {isGameFullyReady && status === 'opponent-turn' && <div className="status-text">Tour de l'adversaire...</div>}
          </>
        )}
        
        {isSpectator && status !== 'connecting' && status !== 'waiting' && (
          <div className="status-text">Mode Spectateur</div>
        )}
      </div>

      {/* My badge - below the board */}
      <PlayerBadge 
        name={myInfo?.name} 
        color={mySide}
        isActive={game.turn() === mySide.charAt(0)}
        timer={timers[mySide]}
        isMe={true}
        isSpectator={isSpectator}
        gameStatus={status}
        onEmojiTrigger={() => setShowEmojiPicker(!showEmojiPicker)}
        showEmojiPicker={showEmojiPicker}
        fen={game.fen()}
        selectedEmoji={activeEmojis[mySide]}
      />
      
      {/* Game actions (Ready, Resign, Draw) at the bottom near the user's badge */}
      <GameActions 
        isPlaying={!isSpectator && status !== 'connecting' && status !== 'waiting' && players.white?.id && players.black?.id}
        isSpectator={isSpectator}
        gameStatus={status}
        isAiGame={isAiGame}
        isReady={isReady}
        drawOfferReceived={drawOfferReceived}
        drawOfferFrom={drawOfferFrom}
        onReady={handleReady}
        onResign={() => socket && socket.emit('resign', { gameId })}
        onOfferDraw={() => socket && socket.emit('offer-draw', { gameId })}
        onAcceptDraw={() => { socket && socket.emit('accept-draw', { gameId }); setDrawOfferReceived(false); setDrawOfferFrom(null); }}
        onDeclineDraw={() => { socket && socket.emit('decline-draw', { gameId }); setDrawOfferReceived(false); setDrawOfferFrom(null); }}
      />
      
      {showEmojiPicker && (
        <div className="emoji-picker-overlay" onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(false); }}>
          {['👍', '👎', '🤬', '👏', '😂', '🔥', '🤔', '💀', '😤', '😎'].map(emoji => (
            <button key={emoji} className="emoji-btn" onClick={() => handleEmojiSend(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      <Leaderboard isOpen={showLeaderboard} onClose={() => setShowLeaderboard(false)} />

      <GameOverModal 
        isOpen={!!gameOverData}
        onClose={() => setGameOverData(null)}
        {...gameOverData}
      />
    </div>
  );
}

export default App;
