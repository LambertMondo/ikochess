import stockfish from 'stockfish'

// We initialize a new stockfish instance per request or pool them.
// For simplicity and to avoid message collisions, we create an instance per move request.
export const getAiMove = async (game, difficulty) => {
  return new Promise((resolve, reject) => {
    let engine;
    try {
      engine = stockfish();
    } catch (e) {
      console.error("Failed to load Stockfish engine. Is it installed?", e)
      return resolve(null)
    }

    const fen = game.fen();
    let bestMoveUci = null;

    // Difficulty mapping (0-20 scale for Stockfish)
    // Adjust depth and skill level based on difficulty string
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
        engine.postMessage('quit');
        resolve(null);
    }, 5000);

    // Handle messages from the engine
    engine.onmessage = (event) => {
      const msg = typeof event === 'string' ? event : event.data;
      if (!msg) return;
      
      if (msg.startsWith('bestmove')) {
        const parts = msg.split(' ');
        if (parts.length > 1) {
          bestMoveUci = parts[1]; // the move in coordinate notation e.g. "e2e4"
          
          // Convert UCI (e2e4) to SAN (e4) for our game logic
          try {
              // Creating a temporary game state to get the proper SAN
              // We pass verbose: true so chess.js parses "e2e4" correctly
              const from = bestMoveUci.substring(0, 2);
              const to = bestMoveUci.substring(2, 4);
              const promotion = bestMoveUci.length > 4 ? bestMoveUci[4] : undefined;
              
              const moveResult = game.move({ from, to, promotion });

              if(moveResult) {
                 game.undo(); // Undo the tmp test move
                 clearTimeout(timeout);
                 engine.postMessage('quit');
                 resolve(moveResult.san);
                 return;
              }
          } catch(e) {
              console.error('Failed parsing Stockfish output back to SAN', e)
          }

          clearTimeout(timeout);
          engine.postMessage('quit');
          resolve(bestMoveUci); // fallback
        } else {
          clearTimeout(timeout);
          engine.postMessage('quit');
          resolve(null);
        }
      }
    };

    // Configure engine
    engine.postMessage('uci');
    engine.postMessage(`setoption name Skill Level value ${skillLevel}`);
    engine.postMessage(`position fen ${fen}`);
    
    // Command to calculate best move
    engine.postMessage(`go depth ${depth}`);
  });
}
