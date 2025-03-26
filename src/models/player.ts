// src/models/player.ts
export interface Player {
  id: string;
  socketId: string;
  username: string;
  score: number;
  isCurrentPlayer: boolean;
  inactive?: boolean;
  eliminated?: boolean;
  position?: number;
}
