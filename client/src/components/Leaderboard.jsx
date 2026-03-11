import React, { useEffect, useState } from 'react';

export const Leaderboard = ({ isOpen, onClose, embedded = false }) => {
  const [activeTab, setActiveTab] = useState('players'); // 'players' | 'clans'
  const [rankings, setRankings] = useState([]);
  const [clanRankings, setClanRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen || embedded) {
      setLoading(true);
      if (activeTab === 'players') {
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
      } else {
        fetch('/api/groups/rankings')
          .then(r => r.json())
          .then(data => {
            setClanRankings(data);
            setLoading(false);
          })
          .catch(err => {
            console.error('Failed to fetch clan rankings', err);
            setLoading(false);
          });
      }
    }
  }, [isOpen, embedded, activeTab]);

  if (!isOpen && !embedded) return null;

  const content = (
    <div className={`leaderboard-panel ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <button className="lb-close-btn" onClick={onClose} aria-label="Fermer">✕</button>
      )}
      
      <div className="lb-tabs">
        <button 
          className={`lb-tab ${activeTab === 'players' ? 'active' : ''}`}
          onClick={() => setActiveTab('players')}
        >
          👤 Joueurs
        </button>
        <button 
          className={`lb-tab ${activeTab === 'clans' ? 'active' : ''}`}
          onClick={() => setActiveTab('clans')}
        >
          🛡️ Clans
        </button>
      </div>

      <div className="lb-header" style={{ marginTop: '10px' }}>
        <span className="lb-trophy">🏆</span>
        <h2>{activeTab === 'players' ? 'Classement des Joueurs' : 'Classement des Clans'}</h2>
      </div>

      {loading ? (
        <div className="lb-loading">
          <div className="lb-spinner"></div>
          <span>Chargement...</span>
        </div>
      ) : activeTab === 'players' ? (
        // PLAYER RANKINGS
        rankings.length === 0 ? (
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
        )
      ) : (
        // CLAN RANKINGS
        clanRankings.length === 0 ? (
          <div className="lb-empty">Aucun clan classé pour le moment.</div>
        ) : (
          <div className="lb-list">
            {clanRankings.map((clan, index) => (
              <div key={clan.id} className={`lb-row ${index < 3 ? 'lb-top-' + (index + 1) : ''}`}>
                <div className="lb-rank">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : <span className="lb-rank-num">#{index + 1}</span>}
                </div>
                <div className="lb-player-info">
                  <div className="lb-player-name">{clan.name || 'Clan Sans Nom'}</div>
                  <div className="lb-player-stats">
                    <span className="lb-elo">ELO {Math.round(clan.group_elo)}</span>
                    <span className="lb-record">
                      Guerres gagnées: <span className="lb-win">{clan.wars_won}</span> / {clan.total_wars}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
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
