import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { io } from 'socket.io-client';
import './App.css';

// Components
import { GameOverModal } from './components/GameOverModal';
import { Leaderboard } from './components/Leaderboard';
import { ChessBoardComponent } from './components/ChessBoardComponent';
import { ChatAndSpectator } from './components/ChatAndSpectator';
import { ChessHUD } from './components/ChessHUD';

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
  const [isReady, setIsReady] = useState(false);
  const [liveSpectators, setLiveSpectators] = useState(0);
  
  // Timers
  const [timers, setTimers] = useState({ white: 300000, black: 300000 });
  const [moveHistory, setMoveHistory] = useState([]);
  
  // UI States
  const [gameOverData, setGameOverData] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeEmojis, setActiveEmojis] = useState({ white: null, black: null });
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Sync Timer Reference
  const syncTimerRef = useRef(null);

  // Parse URL Parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('gameId') || params.get('game') || params.get('watch');
    const isWatchMode = params.has('watch');
    const playerJson = params.get('player');

    let playerData = null;
    try {
      if (playerJson) playerData = JSON.parse(decodeURIComponent(playerJson));
    } catch(e) { 
      // Sometimes player is just an ID, let's wrap it
      if (playerJson) playerData = { id: playerJson };
    }

    if (!gid) {
      alert("Lien invalide. Aucun ID de partie spécifié.");
      return;
    }

    setGameId(gid);

    // Init Socket
    const newSocket = io(API_URL);
    setSocket(newSocket);

    // Local countdown timer approximation to make the UI look active
    syncTimerRef.current = setInterval(() => {
      setTimers(prev => {
        if (status === 'finished' || status === 'waiting' || status === 'connecting' || !prev.lastUpdate) return prev;
        let newTimers = { ...prev };
        return newTimers;
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
        if (data.white === playerData.id) color = 'white';
        else if (data.black === playerData.id) color = 'black';
        else setIsSpectator(true);
        setMyColor(color);
      } else {
        setIsSpectator(true);
      }
      
      // Look for individual readiness
      const readyState = color ? data.ready[color] : false;
      setIsReady(readyState || false);

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
      setMyColor(currentColor => {
        if (currentColor === data.color) setIsReady(data.ready);
        return currentColor;
      });
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

    // Game Over Event
    newSocket.on('game_over', (data) => {
      setStatus('finished');
      setGameOverData(data);
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

  const onPieceDrop = (sourceSquare, targetSquare) => {
    if (status !== 'your-turn' && !isAiGame) return false;
    // For single player testing or unassigned colors, bypass if needed
    if (!myColor && !isAiGame) return false;

    try {
      // The react-chessboard component handles the auto-promote to Queen UI logic implicitly
      // We force a promotion if it's the 8th rank for pawn
      let moveObj = {
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q' // Simplification
      };

      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move(moveObj);
      
      if (move === null) return false;
      
      setGame(gameCopy);
      setStatus('opponent-turn');
      socket.emit('move', { gameId, move: move.san });
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleEmojiSend = (emoji) => {
    if (!myColor || isSpectator) return;
    socket.emit('emoji', { gameId, emoji });
    setShowEmojiPicker(false);
  };

  const handleReady = () => {
    socket.emit('player-ready', { gameId });
    setIsReady(true);
  };

  const getOpponentColor = () => myColor === 'white' ? 'black' : 'white';

  const opponentInfo = myColor ? players[getOpponentColor()] : players.white;
  const myInfo = myColor ? players[myColor] : players.black;
  const oppColor = myColor ? getOpponentColor() : 'white';
  const mySide = myColor || 'black';

  return (
    <div className="app-container" onClick={() => setShowEmojiPicker(false)}>
      
      <ChatAndSpectator 
        liveSpectators={liveSpectators}
        showLeaderboard={showLeaderboard}
        setShowLeaderboard={setShowLeaderboard}
        isPlaying={!isSpectator && status !== 'connecting' && status !== 'waiting' && players.white?.id && players.black?.id}
        isSpectator={isSpectator}
        gameStatus={status}
        isAiGame={isAiGame}
        isReady={isReady}
        handleReady={handleReady}
        socket={socket}
        gameId={gameId}
        showEmojiPicker={showEmojiPicker}
        setShowEmojiPicker={setShowEmojiPicker}
        handleEmojiSend={handleEmojiSend}
      />

      <ChessHUD 
        opponentInfo={opponentInfo}
        oppColor={oppColor}
        myInfo={myInfo}
        mySide={mySide}
        game={game}
        timers={timers}
        status={status}
        isSpectator={isSpectator}
        activeEmojis={activeEmojis}
        showEmojiPicker={showEmojiPicker}
        setShowEmojiPicker={setShowEmojiPicker}
        isReady={isReady}
      />

      <div className="board-wrapper">
        <ChessBoardComponent 
          game={game}
          fen={game.fen()}
          boardOrientation={myColor || 'white'}
          onPieceDrop={onPieceDrop}
          isDraggablePiece={({ piece }) => {
            if (isSpectator) return false;
            if (myColor && piece.charAt(0) !== myColor.charAt(0)) return false;
            if (status !== 'your-turn') return false;
            return true;
          }}
        />
        
        {status === 'connecting' && <div className="status-text">Connexion au serveur...</div>}
        {status === 'waiting' && <div className="status-text">En attente de l'adversaire...</div>}
        {!isReady && status === 'opponent-turn' && <div className="status-text">L'adversaire n'est pas prêt.</div>}
        {!isReady && status === 'your-turn' && <div className="status-text">Veuillez indiquer que vous êtes prêt.</div>}
        {isReady && status === 'your-turn' && <div className="status-text" style={{color: '#43a047'}}>C'est à vous de jouer !</div>}
      </div>

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
