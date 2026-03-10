import React, { useEffect, useState } from 'react';

export const Leaderboard = ({ isOpen, onClose }) => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content leaderboard" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>
        <h2>🏆 Classement des Joueurs</h2>
        
        {loading ? (
          <div className="loading">Chargement des scores...</div>
        ) : rankings.length === 0 ? (
          <div className="empty-state">Aucun joueur classé pour le moment.</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Joueur</th>
                  <th>Points</th>
                  <th>ELO</th>
                  <th>V / D / N</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((player, index) => (
                  <tr key={player.telegram_id} className={index < 3 ? `top-${index + 1}` : ''}>
                    <td className="rank">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </td>
                    <td className="name">{player.username || 'Anonyme'}</td>
                    <td className="score">{player.score} pts</td>
                    <td className="elo">{Math.round(player.elo)}</td>
                    <td className="stats">
                      <span className="win">{player.games_won}</span> / 
                      <span className="loss">{player.games_lost}</span> / 
                      <span className="draw">{player.games_drawn}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
