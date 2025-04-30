// gameController.ts
import { Server, Socket } from "socket.io";
import {
	getRoom,
	saveRoom,
	moveToNextPlayer,
	startPlayerTimer,
	clearRoomTimer,
	endGame,
} from "../controllers/roomController";
import { isValidWord, calculateWordScore } from "../services/wordService";
import { generateRules, getNextRule } from "../models/rule";
import { getRandomLetter } from "@/utils/helpers";
import { calculateTimeLimit } from "@/utils/timer";
import { fetchLobbyFromNextJSApp } from "@/services/lobbies";
import type { GameRoom } from "@/models/room";

export const joinRoom =
	(socket: Socket, io: Server) =>
	async ({
		lobbyId,
		username,
		userId,
	}: {
		lobbyId: string;
		username: string;
		userId: string;
	}) => {
		try {
			const data = await fetchLobbyFromNextJSApp(lobbyId);
			const lobby = data.data;

			if (!lobby) {
				socket.emit("error", { message: "Lobby not found" });
				return;
			}

			//if (lobby.status !== "pending" && lobby.status !== "active") {
			//	console.log("lobby is not joinable");
			//	socket.emit("error", { message: "Lobby is not joinable" });
			//	return;
			//}

			const room = await getRoom(lobbyId);

			// Check if this user is already in the room
			const existingPlayerIndex = room?.players.findIndex(
				(player) => player.id === userId
			);

			if (existingPlayerIndex !== undefined && existingPlayerIndex >= 0) {
				console.log(`${username} reconnected to lobby ${lobbyId}`);

				// Update the player's socket ID
				if (room) {
					room.players[existingPlayerIndex].socketId = socket.id;
					room.players[existingPlayerIndex].inactive = false; // Mark as active again
					await saveRoom(room);

					// Join the socket to the room
					socket.join(lobbyId);

					// Emit events
					socket.emit("roomJoined", {
						roomId: lobbyId,
						roomCode: lobbyId.substring(0, 6).toUpperCase(),
						players: room.players,
					});

					io.to(lobbyId).emit("playerJoined", {
						roomId: lobbyId,
						roomCode: lobbyId.substring(0, 6).toUpperCase(),
						players: room.players,
					});

					return;
				}
			}

			// Original code for new player joining
			if (room && room.players.length >= lobby.maxPlayers) {
				socket.emit("error", { message: "Lobby is full" });
				return;
			}

			socket.join(lobbyId);

			if (!room) {
				const newRoom: GameRoom = {
					id: lobbyId,
					players: [
						{
							id: userId,
							socketId: socket.id,
							username,
							score: 0,
							isCurrentPlayer: false,
							inactive: false,
						},
					],
					currentPlayerIndex: 0,
					lastActive: new Date(),
					createdAt: new Date(),
					rulesCompleted: 0,
					timeLimit: 10,
				};
				await saveRoom(newRoom);

				socket.emit("roomJoined", {
					roomId: lobbyId,
					roomCode: lobbyId.substring(0, 6).toUpperCase(),
					players: newRoom.players,
				});
			} else {
				room.players.push({
					id: userId,
					socketId: socket.id,
					username,
					score: 0,
					isCurrentPlayer: false,
					inactive: false,
				});
				await saveRoom(room);

				socket.emit("roomJoined", {
					roomId: lobbyId,
					roomCode: lobbyId.substring(0, 6).toUpperCase(),
					players: room.players,
				});
			}

			const updatedRoom = await getRoom(lobbyId);
			io.to(lobbyId).emit("playerJoined", {
				roomId: lobbyId,
				roomCode: lobbyId.substring(0, 6).toUpperCase(),
				players: updatedRoom?.players || [],
			});

			console.log(`${username} joined lobby ${lobbyId}`);
		} catch (error) {
			console.error(`Error joining lobby: ${error}`);
			socket.emit("error", { message: "Failed to join lobby" });
		}
	};

export const startGame =
	(socket: Socket, io: Server) =>
	async ({ lobbyId, userId }: { lobbyId: string; userId: string }) => {
		try {
			const room = await getRoom(lobbyId);
			if (!room) {
				socket.emit("error", { message: "Lobby not found" });
				return;
			}

			const lobby = await fetchLobbyFromNextJSApp(lobbyId);
			if (!lobby) {
				socket.emit("error", { message: "Lobby not found" });
				return;
			}

			console.log(JSON.stringify(room.players));
			console.log(userId);
			const isHost = room.players[0]?.id === userId;
			if (!isHost) {
				socket.emit("error", {
					message: "Only the host can start the game",
				});
				return;
			}
			const activePlayers = room.players.filter((p) => !p.inactive);
			if (activePlayers.length < 1) {
				socket.emit("error", {
					message: "Not enough players to start the game",
				});
				return;
			}

			const minWordLength = 4;
			const randomLetter = getRandomLetter();
			const rules = generateRules(minWordLength, randomLetter);
			room.currentRule = rules[0];
			room.currentRuleIndex = 0;
			room.minWordLength = minWordLength;
			room.usedWords = new Set();
			room.rulesCompleted = 0;
			room.timeLimit = 10;

			const firstPlayerIndex = room.players.findIndex((p) => !p.inactive);
			if (firstPlayerIndex !== -1) {
				room.players.forEach((p) => {
					p.isCurrentPlayer = false;
					p.score = 0;
				});

				room.players[firstPlayerIndex].isCurrentPlayer = true;
				room.currentPlayerIndex = firstPlayerIndex;

				await saveRoom(room);

				io.to(lobbyId).emit("gameStarted", {
					roomId: room.id,
					roomCode: room.id.substring(0, 6).toUpperCase(),
					currentRule: room.currentRule.rule,
					timeLeft: room.timeLimit,
					minWordLength: room.minWordLength,
					rulesCompleted: 0,
					currentPlayer: room.players[firstPlayerIndex].username,
					players: room.players.map((p) => ({
						id: p.id,
						username: p.username,
						score: p.score,
						isCurrentPlayer: p.isCurrentPlayer,
					})),
				});

				startPlayerTimer(lobbyId, io);
			}
		} catch (error) {
			console.error(`Error starting game: ${error}`);
			socket.emit("error", { message: "Failed to start game" });
		}
	};

export const submitWord =
	(socket: Socket, io: Server) =>
	async ({
		roomId,
		word,
		userId,
	}: {
		roomId: string;
		word: string;
		userId: string;
	}) => {
		try {
			const room = await getRoom(roomId);
			if (!room || !room.currentRule) {
				socket.emit("error", { message: "Game not in progress" });
				return;
			}
			console.log("submitted ", word);

			const currentPlayerIndex = room.players.findIndex(
				(p) => p.id === userId && p.isCurrentPlayer
			);
			if (
				currentPlayerIndex === -1 ||
				!room.players[currentPlayerIndex].isCurrentPlayer
			) {
				socket.emit("error", { message: "Not your turn" });
				return;
			}

			if (word.length < (room.minWordLength || 4)) {
				socket.emit("wordRejected", {
					reason: `Word must be at least ${
						room.minWordLength || 4
					} letters long`,
				});
				return;
			}

			if (room.usedWords && room.usedWords.has(word.toLowerCase())) {
				socket.emit("wordRejected", {
					reason: "This word was already used in this game",
				});
				return;
			}

			if (!isValidWord(word)) {
				socket.emit("wordRejected", { reason: "Not a valid word" });
				return;
			}

			// FIXED PART: Re-generate the validator function based on the rule
			const randomLetter =
				room.currentRule.rule.match(/'([a-z])'/i)?.[1] ||
				getRandomLetter();
			const rules = generateRules(room.minWordLength || 4, randomLetter);

			// Find the matching rule by comparing rule text
			const matchingRule = rules.find(
				(r) => r.rule === room?.currentRule?.rule
			);

			if (!matchingRule) {
				socket.emit("error", {
					message: "Invalid game state. Please restart the game.",
				});
				return;
			}

			const followsRule = matchingRule.validator(word.toLowerCase());

			if (!followsRule) {
				socket.emit("wordRejected", {
					reason: `Word does not follow the rule: ${room.currentRule.rule}`,
				});
				return;
			}

			if (!room.usedWords) room.usedWords = new Set();
			room.usedWords.add(word.toLowerCase());

			const points = calculateWordScore(word);

			room.players[currentPlayerIndex].score += points;

			room.rulesCompleted = (room.rulesCompleted || 0) + 1;

			const newRule = getNextRule(room);
			room.currentRule = newRule;

			await saveRoom(room);

			clearRoomTimer(roomId);

			await moveToNextPlayer(roomId, io);

			const updatedRoom = await getRoom(roomId);
			if (!updatedRoom) return;

			const newTimeLimit = calculateTimeLimit(updatedRoom);

			io.to(roomId).emit("wordSubmitted", {
				roomId: updatedRoom.id,
				roomCode: updatedRoom.id.substring(0, 6).toUpperCase(),
				word,
				points,
				player: {
					id: updatedRoom.players[currentPlayerIndex].id,
					username: updatedRoom.players[currentPlayerIndex].username,
					score: updatedRoom.players[currentPlayerIndex].score,
				},
				players: updatedRoom.players.map((p) => ({
					id: p.id,
					username: p.username,
					score: p.score,
					isCurrentPlayer: p.isCurrentPlayer,
					eliminated: p.eliminated,
					position: p.position,
				})),
				currentRule: newRule.rule,
				rulesCompleted: updatedRoom.rulesCompleted,
				timeLimit: newTimeLimit,
				minWordLength: updatedRoom.minWordLength,
				currentPlayer:
					updatedRoom.players.find((p) => p.isCurrentPlayer)
						?.username || "",
			});
		} catch (error) {
			console.error(`Error submitting word: ${error}`);
			socket.emit("error", {
				message: "Failed to process word submission",
			});
		}
	};

export const pauseGame =
	(socket: Socket, io: Server) => async (roomId: string) => {
		try {
			const room = await getRoom(roomId);
			if (!room) {
				socket.emit("error", { message: "Room not found" });
				return;
			}

			clearRoomTimer(roomId);

			await saveRoom(room);

			io.to(roomId).emit("gamePaused", {
				roomId: room.id,
				roomCode: room.id.substring(0, 6).toUpperCase(),
				reason: "Game paused by host",
			});
		} catch (error) {
			console.error(`Error pausing game: ${error}`);
			socket.emit("error", { message: "Failed to pause game" });
		}
	};

export const handleDisconnect = (socket: Socket, io: Server) => async () => {
	try {
		console.log("Client disconnected:", socket.id);

		const socketRooms = Array.from(socket.rooms).filter(
			(room) => room !== socket.id
		);

		for (const roomId of socketRooms) {
			const room = await getRoom(roomId);
			if (!room) continue;

			const playerIndex = room.players.findIndex(
				(p) => p.socketId === socket.id
			);

			if (playerIndex !== -1) {
				room.players[playerIndex].inactive = true;

				if (room.currentRule) {
					// Calculate elimination position
					const eliminatedCount = room.players.filter(
						(p) => p.eliminated
					).length;
					room.players[playerIndex].eliminated = true;
					room.players[playerIndex].position = eliminatedCount + 1;
				}

				await saveRoom(room);

				if (
					room.players[playerIndex].isCurrentPlayer &&
					room.currentRule
				) {
					await moveToNextPlayer(roomId, io);
				}

				io.to(roomId).emit("playerStatusUpdate", {
					roomId: room.id,
					players: room.players.map((p) => ({
						id: p.id,
						username: p.username,
						score: p.score,
						isCurrentPlayer: p.isCurrentPlayer,
						inactive: p.inactive,
						eliminated: p.eliminated,
						position: p.position,
					})),
					disconnectedPlayer: room.players[playerIndex].username,
				});

				const activePlayers = room.players.filter(
					(p) => !p.eliminated && !p.inactive
				);

				if (activePlayers.length === 0 && room.currentRule) {
					await endGame(roomId, io);
				}
			}
		}
	} catch (error) {
		console.error("Error handling disconnect:", error);
	}
};
