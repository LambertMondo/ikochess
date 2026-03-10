import React from 'react';
import { GameActions } from './GameActions';

export const ChatAndSpectator = ({
  liveSpectators,
  showLeaderboard,
  setShowLeaderboard
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
    </div>
  );
};
