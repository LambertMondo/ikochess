# 📋 Changelog – IkoChess

## v2.3.0 – Sprint 3 · Compétition Sociale (F1 & F3)

### ✨ Ajouts
- **Clan Wars (F1)** : Support pour les batailles de groupes et clans.
  - Base de données : Ajout de colonnes pour les groupes existants (ELO, guerres gagnées) et création des tables `clan_wars` et `clan_war_matches`.
  - Frontend : Ajout d'un système d'onglets au Leaderboard pour consulter le classement mondial des Joueurs et des Clans.
  - Backend : Endpoint `POST /api/setclan` permettant au bot Telegram de lier un joueur à un Clan (limite de 1 changement tous les 90 jours).
- **Tournois (F3)** : Infrastructure pour les tournois de groupes dédiés.
  - Base de données : Création des tables `tournaments`, `tournament_participants` et `tournament_matches`.
  - Backend : Endpoints `/api/tournaments` pour créer, lister et rejoindre (`/join`) les tournois actifs. Mises en place des limites de participants (`max_players`).

---

## v2.2.0 – Sprint 2 · Personnalisation du plateau (F2)

### ✨ Ajouts
- **Système de Thèmes** : Les joueurs peuvent désormais changer les couleurs de leur échiquier.
- **Déblocage de Thèmes** : 9 thèmes disponibles (ex: Telegram Blue, Océan, Néon Cyberpunk, Or Royal).
  - 3 thèmes gratuits debloqués par défaut.
  - 6 thèmes débloquables via l'ELO (ex: >1000 pour Océan) ou les victoires (ex: 25 victoires pour Forêt).
- **Interface Utilisateur (UI)** :
  - Un bouton 🎨 dans la barre supérieure pour ouvrir le sélecteur de thème.
  - Aperçu des thèmes avec une grille 2x2.
  - Badges pour afficher les thèmes verrouillés, débloqués et actifs.
- **Backend (Supabase & Sockets)** :
  - Tables `themes` et `player_themes` créées avec Row Level Security (RLS).
  - Assignation automatique des thèmes gratuits aux joueurs existants et nouveaux.
  - Déblocage automatique des thèmes mérités à la fin d'une partie (fonction `checkAndUnlockThemes`).
  - Nouveaux événements socket : `get-themes`, `set-theme`, et `get-active-theme`.

---

## v2.1.0 – Sprint 1 · Titres & Profils (11 mars 2026)

### ✨ Ajouts
- **Système de titres** avec icônes pièces d'échecs :
  - ♟ Novice (<800) → ♞ Amateur → ♝ Joueur → ♜ Expert → ♛ Maître → ♚ Grand Maître → 👑 Légende (1800+)
  - Titre mis à jour automatiquement après chaque partie
- **Suivi des streaks** : série de victoires actuelle + meilleur streak historique
- **Profil joueur** via socket `get-profile` (stats complètes, 10 dernières parties, historique des saisons)
- **Leaderboard global** via socket `get-leaderboard` (classement ELO)
- **Table `season_history`** pour archiver les performances par saison

### 🐛 Corrections (pré-Sprint)
- Promotion : choix Dame/Tour/Cavalier/Fou (plus de promotion auto en Dame)
- Règle des 50 coups détectée avec raison distincte
- Game Over Modal : affiche correctement titre, message, ELO, variation
- AI : clone du game state (plus de race condition move/undo)
- Protection du tour en mode AI (plus de bypass)
- Promotion + capture détectée en tap-to-move
- Statut challenge → `finished` dans Supabase
- Émojis : `send-emoji` (plus de mismatch)
- Abandon et Nulle : fonctionnels
- Nettoyage mémoire des parties terminées (60s)

### 🗃️ Supabase
- `players` : colonnes `title`, `win_streak`, `best_streak` ajoutées
- Table `season_history` créée
- Titres calculés pour les joueurs existants

---

## v2.0.0 – Refactoring Architecture (mars 2026)

- Migration monolithique → architecture modulaire (controllers, game engine)
- Intégration Socket.io avec rooms dédiées
- Stockfish AI avec niveaux de difficulté
- Système ELO complet
- Mode spectateur en temps réel
- Émojis en jeu
- Timers validés côté serveur
