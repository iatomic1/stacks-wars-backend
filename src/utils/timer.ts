// src/utils/timer.ts

import type { GameRoom } from "../models/room";

export const calculateTimeLimit = (room: GameRoom): number => {
  const baseTime = 10;

  if (!room.rulesCompleted) {
    return baseTime;
  }

  const reduction = Math.floor(room.rulesCompleted / 4) * 2;
  return Math.max(3, baseTime - reduction);
};
