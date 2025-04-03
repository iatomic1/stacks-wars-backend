import redisService from "@/services/redisService";
import type { GameRoom } from "../models/room";
import { calculateTimeLimit } from "../utils/timer";
import type { Server } from "socket.io";

// Change the type to NodeJS.Timer which is compatible with the return type of setInterval
export const roomTimers: Record<string, NodeJS.Timer> = {};

export const getRoom = async (roomId: string): Promise<GameRoom | null> => {
  try {
    return await redisService.getRoom(roomId);
  } catch (error) {
    console.error(`Error getting room ${roomId}:`, error);
    return null;
  }
};

export const saveRoom = async (room: GameRoom): Promise<void> => {
  try {
    room.lastActive = new Date();
    await redisService.saveRoom(room);
  } catch (error) {
    console.error(`Error saving room ${room.id}:`, error);
  }
};

export const clearRoomTimer = (roomId: string) => {
  if (roomTimers[roomId]) {
    clearInterval(roomTimers[roomId]);
    delete roomTimers[roomId];
  }
};

export const startPlayerTimer = async (roomId: string, io: Server) => {
  try {
    const room = await getRoom(roomId);
    if (!room) return;

    clearRoomTimer(roomId);

    const timeLimit = calculateTimeLimit(room);
    // Initialize timeLimit property if it doesn't exist
    room.timeLimit = timeLimit;
    await saveRoom(room);

    io.to(roomId).emit("timeUpdate", {
      roomId: room.id,
      timeLeft: room.timeLimit,
      currentPlayer:
        room.players.find((p) => p.isCurrentPlayer)?.username || "",
    });

    roomTimers[roomId] = setInterval(async () => {
      const room = await getRoom(roomId);
      if (!room) {
        clearRoomTimer(roomId);
        return;
      }

      // Ensure timeLimit exists before decrementing
      if (room.timeLimit === undefined) {
        room.timeLimit = calculateTimeLimit(room);
      } else {
        room.timeLimit--;
      }
      await saveRoom(room);

      io.to(roomId).emit("timeUpdate", {
        roomId: room.id,
        timeLeft: room.timeLimit,
        currentPlayer:
          room.players.find((p) => p.isCurrentPlayer)?.username || "",
      });

      if (room.timeLimit <= 0) {
        clearRoomTimer(roomId);
        const currentPlayerIndex = room.players.findIndex(
          (p) => p.isCurrentPlayer,
        );
        if (currentPlayerIndex === -1) return;

        // Calculate elimination position
        const eliminatedCount = room.players.filter((p) => p.eliminated).length;
        room.players[currentPlayerIndex].eliminated = true;
        room.players[currentPlayerIndex].position = eliminatedCount + 1;

        await saveRoom(room);

        io.to(roomId).emit("playerEliminated", {
          username: room.players[currentPlayerIndex].username,
          reason: "Timed out",
          players: room.players.map((p) => ({
            id: p.id,
            username: p.username,
            score: p.score,
            isCurrentPlayer: p.isCurrentPlayer,
            eliminated: p.eliminated,
            inactive: p.inactive,
            position: p.position,
          })),
        });

        await moveToNextPlayer(roomId, io);
      }
    }, 1000);
  } catch (error) {
    console.error(`Error in startPlayerTimer for room ${roomId}:`, error);
  }
};

export const moveToNextPlayer = async (roomId: string, io: Server) => {
  try {
    const room = await getRoom(roomId);
    if (!room) return;

    const totalPlayers = room.players.length;
    let nextPlayerIndex = -1;
    let attempts = 0;

    for (
      let i = room.currentPlayerIndex + 1;
      attempts < totalPlayers;
      i++, attempts++
    ) {
      const index = i % totalPlayers;
      if (!room.players[index].eliminated && !room.players[index].inactive) {
        nextPlayerIndex = index;
        break;
      }
    }

    const activePlayers = room.players.filter(
      (p) => !p.eliminated && !p.inactive,
    );
    if (activePlayers.length === 1) {
      await endGame(roomId, io);
      return;
    }

    if (nextPlayerIndex === -1) {
      await endGame(roomId, io);
      return;
    }

    room.players.forEach((p) => (p.isCurrentPlayer = false));
    room.currentPlayerIndex = nextPlayerIndex;
    room.players[nextPlayerIndex].isCurrentPlayer = true;

    room.timeLimit = calculateTimeLimit(room);
    await saveRoom(room);

    io.to(roomId).emit("timeUpdate", {
      roomId: room.id,
      timeLeft: room.timeLimit,
      currentPlayer: room.players[nextPlayerIndex].username,
    });

    startPlayerTimer(roomId, io);
  } catch (error) {
    console.error(`Error in moveToNextPlayer: ${error}`);
  }
};

export const endGame = async (roomId: string, io: Server) => {
  try {
    const room = await getRoom(roomId);
    if (!room) return;

    clearRoomTimer(roomId);

    const nonEliminatedPlayers = room.players.filter((p) => !p.eliminated);

    if (nonEliminatedPlayers.length === 0) {
      // All players eliminated
      io.to(roomId).emit("gameOver", {
        roomId: room.id,
        winners: [],
        players: room.players.map((p) => ({
          username: p.username,
          id: p.id,
          score: p.score,
          eliminated: p.eliminated,
          inactive: p.inactive,
          position: p.position,
        })),
        reason: "All players have been eliminated.",
      });
      return;
    }

    if (nonEliminatedPlayers.length === 1) {
      // Last player standing wins
      const winner = nonEliminatedPlayers[0];
      io.to(roomId).emit("gameOver", {
        roomId: room.id,
        winners: [
          {
            username: winner.username,
            score: winner.score,
          },
        ],
        players: room.players.map((p) => ({
          id: p.id,
          username: p.username,
          score: p.score,
          eliminated: p.eliminated,
          inactive: p.inactive,
          position: p.position,
        })),
        reason: "Last player standing wins!",
      });
      return;
    }

    // Determine by highest score (fallback)
    const maxScore = Math.max(...nonEliminatedPlayers.map((p) => p.score));
    const winners = nonEliminatedPlayers.filter((p) => p.score === maxScore);

    io.to(roomId).emit("gameOver", {
      roomId: room.id,
      winners: winners.map((p) => ({
        username: p.username,
        score: p.score,
      })),
      players: room.players.map((p) => ({
        id: p.id,
        username: p.username,
        score: p.score,
        eliminated: p.eliminated,
        inactive: p.inactive,
        isCurrentPlayer: p.isCurrentPlayer,
        position: p.position,
      })),
      reason: "Game ended with multiple players - highest score wins",
    });
  } catch (error) {
    console.error(`Error ending game for room ${roomId}:`, error);
  }
};
