import { Server, Socket } from "socket.io";
import {
  joinRoom,
  startGame,
  submitWord,
  pauseGame,
  handleDisconnect,
} from "../controllers/gameController";

export const setupSocketHandlers = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log("New client connected:", socket.id);

    socket.on("joinRoom", joinRoom(socket, io));
    socket.on("startGame", startGame(socket, io));
    socket.on("submitWord", submitWord(socket, io));
    socket.on("pauseGame", pauseGame(socket, io));
    socket.on("disconnect", handleDisconnect(socket, io));
  });
};
