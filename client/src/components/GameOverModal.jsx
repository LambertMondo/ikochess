import React, { useEffect } from 'react';

// ELO Change display formatter
const formatEloChange = (change) => {
  if (!change) return null;
  const sign = change > 0 ? '+' : '';
  const className = change > 0 ? 'elo-gain' : change < 0 ? 'elo-loss' : 'elo-neutral';
  return <span className={`elo-change ${className}`}>({sign}{Math.round(change)})</span>;
};

export const GameOverModal = ({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  players, 
  eloChanges 
}) => {
  useEffect(() => {
    if (isOpen) {
      // Small vibration effect on game over (if supported)
      if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
        try {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        } catch (e) {}
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content text-center">
        <h2 className={title.includes('Victoire') ? 'text-success' : title.includes('Défaite') ? 'text-danger' : ''}>
          {title}
        </h2>
        
        <div className="game-over-icon">
          {title.includes('Victoire') ? '🏆' : title.includes('Défaite') ? '💔' : '🤝'}
        </div>
        
        <p className="game-over-message">{message}</p>
        
        {eloChanges && Object.keys(eloChanges).length > 0 && (
          <div className="elo-results">
            <h3>Évolution ELO</h3>
            <div className="elo-players">
              <div className="elo-player">
                <div className="elo-name">{players?.white?.name || 'Blancs'}</div>
                <div className="elo-values">
                  <span className="elo-current">{Math.round(eloChanges.white?.newElo)}</span>
                  {formatEloChange(eloChanges.white?.change)}
                </div>
              </div>
              <div className="elo-divider">VS</div>
              <div className="elo-player">
                <div className="elo-name">{players?.black?.name || 'Noirs'}</div>
                <div className="elo-values">
                  <span className="elo-current">{Math.round(eloChanges.black?.newElo)}</span>
                  {formatEloChange(eloChanges.black?.change)}
                </div>
              </div>
            </div>
          </div>
        )}

        <button className="btn btn-primary mt-20" onClick={onClose} style={{width: '100%'}}>
          Fermer
        </button>
      </div>
    </div>
  );
};
