import React from 'react';

const getInitial = (name) => {
  if (!name) return '?';
  if (name === 'OpenClaw AI') return '🤖';
  return name.charAt(0).toUpperCase();
};

const formatTime = (ms) => {
  if (ms == null) return '--:--';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

// Evaluate missing pieces based on current FEN and standard starting material
const getCapturedDifferences = (fen, playerColor) => {
  if (!fen) return '';
  const boardPart = fen.split(' ')[0];
  
  // Count current pieces
  const counts = {
    P: 0, N: 0, B: 0, R: 0, Q: 0,
    p: 0, n: 0, b: 0, r: 0, q: 0
  };
  
  for (let char of boardPart) {
    if (counts[char] !== undefined) counts[char]++;
  }
  
  // Starting material counts
  const start = {
    P: 8, N: 2, B: 2, R: 2, Q: 1,
    p: 8, n: 2, b: 2, r: 2, q: 1
  };
  
  // Differences (what the opponent has lost = what this player has captured)
  let capturedStr = '';
  
  if (playerColor === 'white') {
    const pLost = start.p - counts.p;
    const nLost = start.n - counts.n;
    const bLost = start.b - counts.b;
    const rLost = start.r - counts.r;
    const qLost = start.q - counts.q;
    
    if (pLost > 0) capturedStr += ` ♙+${pLost}`;
    if (nLost > 0) capturedStr += ` ♘+${nLost}`;
    if (bLost > 0) capturedStr += ` ♗+${bLost}`;
    if (rLost > 0) capturedStr += ` ♖+${rLost}`;
    if (qLost > 0) capturedStr += ` ♕+${qLost}`;
  } else {
    const PLost = start.P - counts.P;
    const NLost = start.N - counts.N;
    const BLost = start.B - counts.B;
    const RLost = start.R - counts.R;
    const QLost = start.Q - counts.Q;
    
    if (PLost > 0) capturedStr += ` ♟+${PLost}`;
    if (NLost > 0) capturedStr += ` ♞+${NLost}`;
    if (BLost > 0) capturedStr += ` ♝+${BLost}`;
    if (RLost > 0) capturedStr += ` ♜+${RLost}`;
    if (QLost > 0) capturedStr += ` ♛+${QLost}`;
  }

  return capturedStr.trim();
};

export const PlayerBadge = ({ 
  name, 
  color, 
  isActive, 
  timer, 
  isMe, 
  isSpectator, 
  gameStatus,
  onEmojiTrigger,
  showEmojiPicker,
  fen,
  selectedEmoji
}) => {
  const capturedPieces = getCapturedDifferences(fen, color);

  return (
    <div className={`player-badge ${isActive ? 'active' : ''} ${color}`}>
      <div className="player-initial">{getInitial(name)}</div>
      
      <div className="player-info">
        <span className="player-name">{name || 'Joueur'}</span>
        {capturedPieces && <span className="captured-pieces" style={{fontSize:'0.75rem', color:'#aaa', marginLeft:'8px'}}>{capturedPieces}</span>}
      </div>

      {timer != null && (
        <div className={`player-timer ${timer < 30000 ? 'danger' : timer < 60000 ? 'warning' : ''}`}>
          {formatTime(timer)}
        </div>
      )}

      {isMe && !isSpectator && gameStatus !== 'finished' && (
        <button
          className="emoji-trigger"
          onClick={(e) => { e.stopPropagation(); onEmojiTrigger(); }}
          title="Envoyer un emoji"
        >
          💬
        </button>
      )}

      {selectedEmoji && <div className="emoji-float-badge">{selectedEmoji}</div>}

      <div className={`piece-color ${color}`}>{color === 'white' ? '♔' : '♚'}</div>
    </div>
  );
};
