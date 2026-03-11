import React, { useState } from 'react';

export const GameActions = ({ 
  isPlaying, 
  isSpectator, 
  gameStatus, 
  isAiGame, 
  drawOfferPending,
  drawOfferReceived,
  drawOfferFrom,
  onOfferDraw,
  onAcceptDraw,
  onDeclineDraw,
  onResign,
  onReady,
  isReady 
}) => {
  const [confirmResign, setConfirmResign] = useState(false);

  if (isSpectator || gameStatus === 'finished') return null;

  const handleResign = () => {
    if (confirmResign) {
      onResign();
      setConfirmResign(false);
    } else {
      setConfirmResign(true);
      setTimeout(() => setConfirmResign(false), 3000);
    }
  };

  return (
    <div className="game-actions">
      {!isReady && (gameStatus === 'connecting' || gameStatus === 'waiting' || gameStatus === 'your-turn' || gameStatus === 'opponent-turn') && (
         <button className="btn btn-action btn-ready" onClick={onReady} style={{backgroundColor: '#28a745'}}>
           ✅ Je suis prêt !
         </button>
      )}

      {isReady && isPlaying && (
        <>
          <button
            className={`btn btn-action ${confirmResign ? 'btn-danger-confirm' : 'btn-danger'}`}
            onClick={handleResign}
          >
            {confirmResign ? '⚠️ Confirmer ?' : '🏳️ Abandonner'}
          </button>

          {!isAiGame && !drawOfferReceived && (
            <button 
              className="btn btn-action btn-secondary" 
              onClick={onOfferDraw} 
              disabled={drawOfferPending}
            >
              🤝 Nulle
            </button>
          )}

          {drawOfferReceived && (
            <div className="draw-offer-actions" style={{ display: 'flex', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', alignSelf: 'center', color: '#ffd600' }}>
                ⚡ Nulle proposée !
              </span>
              <button 
                className="btn btn-action" 
                onClick={onAcceptDraw}
                style={{ backgroundColor: '#28a745' }}
              >
                ✅ Accepter
              </button>
              <button 
                className="btn btn-action" 
                onClick={onDeclineDraw}
                style={{ backgroundColor: '#dc3545' }}
              >
                ❌ Refuser
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
