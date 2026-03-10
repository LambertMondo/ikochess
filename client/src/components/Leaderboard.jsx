import React, { useEffect, useState } from 'react';

export const Leaderboard = ({ isOpen, onClose, embedded = false }) => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen || embedded) {
      setLoading(true);
      fetch('/api/rankings')
        .then(r => r.json())
        .then(data => {
          setRankings(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch rankings', err);
          setLoading(false);
        });
    }
  }, [isOpen, embedded]);

  if (!isOpen && !embedded) return null;

  const content = (
    <div className={`leaderboard-panel ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <button className="lb-close-btn" onClick={onClose} aria-label="Fermer">✕</button>
      )}
      <div className="lb-header">
        <span className="lb-trophy">🏆</span>
        <h2>Classement des Joueurs</h2>
      </div>

      {loading ? (
        <div className="lb-loading">
          <div className="lb-spinner"></div>
          <span>Chargement...</span>
        </div>
      ) : rankings.length === 0 ? (
        <div className="lb-empty">Aucun joueur classé pour le moment.</div>
      ) : (
        <div className="lb-list">
          {rankings.map((player, index) => (
            <div key={player.telegram_id} className={`lb-row ${index < 3 ? 'lb-top-' + (index + 1) : ''}`}>
              <div className="lb-rank">
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : <span className="lb-rank-num">#{index + 1}</span>}
              </div>
              <div className="lb-player-info">
                <div className="lb-player-name">{player.username || 'Anonyme'}</div>
                <div className="lb-player-stats">
                  <span className="lb-elo">ELO {Math.round(player.elo)}</span>
                  <span className="lb-record">
                    <span className="lb-win">{player.games_won}V</span>
                    <span className="lb-loss">{player.games_lost}D</span>
                    <span className="lb-draw">{player.games_drawn}N</span>
                  </span>
                </div>
              </div>
              <div className="lb-score">{player.score}<small> pts</small></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
};
