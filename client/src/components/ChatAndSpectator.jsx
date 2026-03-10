import React from 'react';
import { GameActions } from './GameActions';

export const ChatAndSpectator = ({
  liveSpectators,
  showLeaderboard,
  setShowLeaderboard,
  isPlaying,
  isSpectator,
  gameStatus,
  isAiGame,
  isReady,
  handleReady,
  socket,
  gameId,
  showEmojiPicker,
  setShowEmojiPicker,
  handleEmojiSend
}) => {
  return (
    <div className="chat-spectator-container">
      <div className="top-bar">
        <h1 className="app-title">
          ♘ Telegram Chess
        </h1>
        <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
          {liveSpectators > 0 && (
            <div className="live-spectators" title="Spectateurs en direct">
              👁 {liveSpectators}
            </div>
          )}
          <button className="btn btn-secondary" style={{padding:'5px 10px', fontSize:'0.85rem'}} onClick={() => setShowLeaderboard(true)}>
            🏆 Classement
          </button>
        </div>
      </div>

      <GameActions 
        isPlaying={isPlaying}
        isSpectator={isSpectator}
        gameStatus={gameStatus}
        isAiGame={isAiGame}
        isReady={isReady}
        onReady={handleReady}
        onResign={() => socket && socket.emit('resign', { gameId })}
        onOfferDraw={() => socket && socket.emit('offer-draw', { gameId })} // using correct event
        onAcceptDraw={() => socket && socket.emit('accept-draw', { gameId })}
        onDeclineDraw={() => socket && socket.emit('decline-draw', { gameId })}
      />

      {showEmojiPicker && (
        <div className="emoji-picker-overlay" onClick={(e) => e.stopPropagation()}>
          {['👍', '👎', '🤬', '👏', '😂', '🔥', '🤔', '💀', '😤', '😎'].map(emoji => (
            <button key={emoji} className="emoji-btn" onClick={() => handleEmojiSend(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
