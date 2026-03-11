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
  isDraggablePiece,
  onPromotionPieceSelect,
  onPromotionCheck
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
        customDarkSquareStyle={{ backgroundColor: '#2b5278' }}
        customLightSquareStyle={{ backgroundColor: '#6490b1' }}
        isDraggablePiece={isDraggablePiece}
        autoPromoteToQueen={false}
        onPromotionPieceSelect={onPromotionPieceSelect}
        onPromotionCheck={onPromotionCheck}
        promotionDialogVariant="default"
      />
    </div>
  );
};
