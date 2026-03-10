import React from 'react';
import { Chessboard } from 'react-chessboard';

export const ChessBoardComponent = ({
  game,
  fen,
  boardOrientation,
  onPieceDrop,
  onSquareClick,
  onSquareRightClick,
  customSquareStyles,
  isDraggablePiece
}) => {
  return (
    <div className="board-container">
      <Chessboard 
        id="BasicBoard" 
        position={fen} 
        onPieceDrop={onPieceDrop}
        onSquareClick={onSquareClick}
        onSquareRightClick={onSquareRightClick}
        boardOrientation={boardOrientation}
        customSquareStyles={customSquareStyles}
        animationDuration={200}
        customDarkSquareStyle={{ backgroundColor: '#2b5278' }} // Telegram Blue Theme (Dark)
        customLightSquareStyle={{ backgroundColor: '#6490b1' }} // Telegram Blue Theme (Light)
        isDraggablePiece={({ piece, sourceSquare }) => isDraggablePiece(piece)}
        autoPromoteToQueen={/* Feature needed auto promote to queen */ true}
      />
    </div>
  );
};
