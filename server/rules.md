# Guide de l'IA OpenClaw - Règles du Jeu d'Échecs

*(Ce document est basé sur le manuel officiel de la Fédération Échiquéenne Francophone de Belgique - 2016)*

## Principes Généraux
- **Objectif :** Faire Échec et Mat au Roi adverse.
- **Règles Standards :** Toutes les règles standards FIDE s'appliquent (déplacements classiques, prise en passant, promotion, roque).

## Évaluation et Stratégie (Manuel FEFB)
Pour prendre la meilleure décision, l'IA doit suivre une logique en 5 étapes :

1. **Relever les niveaux des joueurs :** Identifier qui a l'avantage (matériel, positionnel).
2. **Interpréter la situation et relever les tensions :**
   - **Menaces imminentes :** Y a-t-il un risque de Mat ?
   - **Tactiques :** Chercher les Fourchettes, Clouages, Enfilades, Doubles attaques, Attaques à la découverte, situations de Zugzwang ou Déviations.
   - **Défenses :** Y a-t-il une pièce non protégée ? Le Roi est-il en échec ?
3. **Analyser la situation (Rayonnement des pièces) :**
   - Contrôle du centre (très important).
   - Solidité de la ligne de pions.
   - Occupation des colonnes ouvertes (surtout pour les Tours).
   - Occupation des diagonales (surtout pour les Fous).
   - Position des Cavaliers (éviter les bords de l'échiquier).
4. **Rechercher des solutions :**
   - Ne pas s'arrêter au premier coup évident.
   - Classer les tensions par ordre : Urgentes (parer un mat, sauver une pièce de valeur) et Importantes (améliorer sa position).
5. **Choisir la meilleure solution :**
   - Opter pour le coup qui résout le plus de tensions à la fois.
   - Garder la maîtrise du jeu pour faire aboutir son plan.

## Instructions pour l'IA Qwen
Lors de la génération de ton prochain coup (au format SAN) :
- Analyse le FEN fourni et l'historique de la partie.
- Applique les grilles d'évaluation ci-dessus (contrôle du centre, tensions, rayonnement).
- **Très important :** Vérifie TOUJOURS que le coup que tu choisis fait partie de la liste des `Legal moves` fournie dans le prompt. Les règles du manuel t'aident à choisir le *meilleur* coup tactique, mais c'est la liste des coups légaux qui définit ce que tu as *le droit* de jouer.
- Réponds UNIQUEMENT avec le coup SAN choisi.

## Heuristiques d'Évaluation (Pour IA Avancée)
En plus de la tactique directe, pour avoir un niveau de type "Grand Maître", intègre ces heuristiques standard des moteurs d'échecs dans tes calculs :
- **Équilibre Matériel :** Pion=1, Cavalier/Fou=3, Tour=5, Dame=9. Évite les échanges déficitaires sauf gain tactique clair.
- **Tables de Pièces/Cases (PSQT) :** Préfère les Cavaliers au centre, avance les Pions intelligemment, active tes pièces (tours sur les colonnes ouvertes).
- **Structure de Pions :** Pénalise les pions doublés ou isolés. Valorise les pions passés et liés.
- **Sécurité du Roi :** Protège le Roi derrière un bouclier de pions solide. Pénalise un Roi exposé.
- **Contrôle du Centre :** Occuper ou contrôler les 4 cases centrales (d4, e4, d5, e5) est primordial pour la mobilité de toutes les autres pièces.
- **Mobilité et Menaces :** Maximise le nombre de coups légaux avantageux et crée des menaces concrètes (mat, gain de matériel) à chaque coup si possible.
