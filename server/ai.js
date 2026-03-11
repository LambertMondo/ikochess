import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// The stockfish npm package has no "main" field in package.json.
// We must require the exact bin/stockfish.js file directly.
const Stockfish = require('stockfish/bin/stockfish.js');

export const getAiMove = async (game, difficulty) => {
  return new Promise((resolve) => {
    let engine;
    try {
      engine = Stockfish();
    } catch (e) {
      console.error("Failed to load Stockfish engine:", e);
      return resolve(null);
    }

    const fen = game.fen();

    // Difficulty mapping (0-20 scale for Stockfish)
    let skillLevel = 5;
    let depth = 5;
    
    switch(difficulty) {
      case 'easy':
        skillLevel = 1;
        depth = 3;
        break;
      case 'medium':
        skillLevel = 5;
        depth = 5;
        break;
      case 'hard':
        skillLevel = 15;
        depth = 10;
        break;
      case 'grandmaster':
        skillLevel = 20;
        depth = 15;
        break;
      default:
        skillLevel = 5;
        depth = 5;
    }

    const timeout = setTimeout(() => {
      console.error("Stockfish timed out");
      try { engine.postMessage('quit'); } catch(e) {}
      resolve(null);
    }, 8000);

    // Handle messages from the engine
    engine.onmessage = (msg) => {
      if (typeof msg !== 'string') msg = msg.data;
      if (!msg) return;
      
      if (msg.startsWith('bestmove')) {
        const parts = msg.split(' ');
        if (parts.length > 1) {
          const bestMoveUci = parts[1];
          
          // Convert UCI (e2e4) to SAN (e4) for our game logic
          try {
            const from = bestMoveUci.substring(0, 2);
            const to = bestMoveUci.substring(2, 4);
            const promotion = bestMoveUci.length > 4 ? bestMoveUci[4] : undefined;
            
            // Use a clone to avoid race conditions on the shared game state
            const { Chess } = require('chess.js');
            const testGame = new Chess(game.fen());
            const moveResult = testGame.move({ from, to, promotion });
            if (moveResult) {
              clearTimeout(timeout);
              try { engine.postMessage('quit'); } catch(e) {}
              resolve(moveResult.san);
              return;
            }
          } catch(e) {
            console.error('Failed parsing Stockfish output to SAN:', e);
          }

          clearTimeout(timeout);
          try { engine.postMessage('quit'); } catch(e) {}
          resolve(bestMoveUci); // fallback to UCI notation
        } else {
          clearTimeout(timeout);
          try { engine.postMessage('quit'); } catch(e) {}
          resolve(null);
        }
      }
    };

    // Configure engine
    engine.postMessage('uci');
    engine.postMessage(`setoption name Skill Level value ${skillLevel}`);
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);
  });
};
