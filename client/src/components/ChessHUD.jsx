import React from 'react';
import { PlayerBadge } from './PlayerBadge';

export const ChessHUD = ({
  opponentInfo,
  oppColor,
  myInfo,
  mySide,
  game,
  timers,
  status,
  isSpectator,
  activeEmojis,
  showEmojiPicker,
  setShowEmojiPicker,
  isReady
}) => {
  return (
    <>
      <PlayerBadge 
        name={opponentInfo?.name} 
        color={oppColor}
        isActive={game.turn() === oppColor.charAt(0)}
        timer={timers[oppColor]}
        isMe={false}
        gameStatus={status}
        fen={game.fen()}
        selectedEmoji={activeEmojis[oppColor]}
      />

      <PlayerBadge 
        name={myInfo?.name} 
        color={mySide}
        isActive={game.turn() === mySide.charAt(0)}
        timer={timers[mySide]}
        isMe={true}
        isSpectator={isSpectator}
        gameStatus={status}
        onEmojiTrigger={() => setShowEmojiPicker(!showEmojiPicker)}
        showEmojiPicker={showEmojiPicker}
        fen={game.fen()}
        selectedEmoji={activeEmojis[mySide]}
      />
    </>
  );
};
