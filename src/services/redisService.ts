// services/redis.ts
import type { Player } from "@/models/player";
import type { GameRoom } from "@/models/room";
import Redis from "ioredis";

// Default expiration time for game rooms (24 hours in seconds)
const DEFAULT_ROOM_EXPIRY = 60 * 60 * 24;

class RedisService {
	private client: Redis;
	private isConnected: boolean = false;

	constructor() {
		// Initialize Redis client with environment-based configuration
		this.client = new Redis({
			host: process.env.REDIS_HOST || "localhost",
			port: parseInt(process.env.REDIS_PORT || "6379"),
			password: process.env.REDIS_PASSWORD,
			// Enable reconnection with exponential backoff
			retryStrategy: (times) => {
				const maxDelay = 30000; // Maximum delay of 30 seconds
				const delay = Math.min(times * 100, maxDelay);
				console.log(
					`Redis connection attempt ${times}, retrying in ${delay}ms`
				);
				return delay;
			},
			maxRetriesPerRequest: 3,
		});

		this.client.on("error", (err) => {
			this.isConnected = false;
			console.error("Redis connection error:", err);
		});

		this.client.on("connect", () => {
			this.isConnected = true;
			console.log("Connected to Redis");
		});

		this.client.on("reconnecting", () => {
			console.log("Reconnecting to Redis...");
		});

		this.client.on("end", () => {
			this.isConnected = false;
			console.log("Redis connection ended");
		});
	}

	// Check connection status
	isReady(): boolean {
		return this.isConnected;
	}

	// Save a game room to Redis with error handling
	async saveRoom(room: GameRoom): Promise<void> {
		const roomKey = `room:${room.id}`;

		try {
			if (!this.isConnected) {
				console.warn("Redis not connected, using in-memory cache only");
				return;
			}

			// Convert Set to Array for JSON serialization
			const serializedRoom = {
				...room,
				usedWords: room.usedWords ? Array.from(room.usedWords) : [],
				lastActive: room.lastActive?.toISOString(),
				createdAt: room.createdAt?.toISOString(),
			};

			await this.client.setex(
				roomKey,
				DEFAULT_ROOM_EXPIRY,
				JSON.stringify(serializedRoom)
			);
		} catch (error) {
			console.error("Error saving room to Redis:", error);
			// We'll continue with the in-memory cache even if Redis fails
		}
	}

	// Get a game room from Redis with error handling
	async getRoom(roomId: string): Promise<GameRoom | null> {
		const roomKey = `room:${roomId}`;

		try {
			if (!this.isConnected) {
				console.warn("Redis not connected, using in-memory cache only");
				return null;
			}

			const roomData = await this.client.get(roomKey);

			if (!roomData) {
				return null;
			}

			const parsedRoom = JSON.parse(roomData);

			// Convert array back to Set and dates back to Date objects
			return {
				...parsedRoom,
				usedWords: parsedRoom.usedWords
					? new Set(parsedRoom.usedWords)
					: new Set(),
				lastActive: parsedRoom.lastActive
					? new Date(parsedRoom.lastActive)
					: new Date(),
				createdAt: parsedRoom.createdAt
					? new Date(parsedRoom.createdAt)
					: new Date(),
			};
		} catch (error) {
			console.error("Error getting room from Redis:", error);
			return null;
		}
	}

	// Delete a game room from Redis with error handling
	async deleteRoom(roomId: string): Promise<void> {
		const roomKey = `room:${roomId}`;

		try {
			if (!this.isConnected) {
				console.warn(
					"Redis not connected, skipping Redis delete operation"
				);
				return;
			}

			await this.client.del(roomKey);
		} catch (error) {
			console.error("Error deleting room from Redis:", error);
			// Continue even if Redis operation fails
		}
	}

	// Update a player in a room with error handling
	async updatePlayer(roomId: string, player: Player): Promise<void> {
		try {
			const room = await this.getRoom(roomId);

			if (!room) {
				throw new Error(`Room ${roomId} not found`);
			}

			// Find and update player
			const playerIndex = room.players.findIndex(
				(p) => p.id === player.id
			);

			if (playerIndex !== -1) {
				room.players[playerIndex] = player;
				await this.saveRoom(room);
			}
		} catch (error) {
			console.error("Error updating player in Redis:", error);
			// Let the caller handle this error if needed
			throw error;
		}
	}

	// Get all active rooms with error handling
	async getAllRooms(): Promise<string[]> {
		try {
			if (!this.isConnected) {
				console.warn("Redis not connected, cannot get all rooms");
				return [];
			}

			const keys = await this.client.keys("room:*");
			return keys.map((key) => key.replace("room:", ""));
		} catch (error) {
			console.error("Error getting all rooms from Redis:", error);
			return [];
		}
	}

	// Update room timer expiration with error handling
	async updateRoomExpiry(
		roomId: string,
		seconds = DEFAULT_ROOM_EXPIRY
	): Promise<void> {
		const roomKey = `room:${roomId}`;

		try {
			if (!this.isConnected) {
				console.warn("Redis not connected, skipping expiry update");
				return;
			}

			await this.client.expire(roomKey, seconds);
		} catch (error) {
			console.error("Error updating room expiry in Redis:", error);
			// Continue even if this operation fails
		}
	}

	// Ping Redis to check connection
	async ping(): Promise<boolean> {
		try {
			const result = await this.client.ping();
			return result === "PONG";
		} catch (error) {
			console.error("Redis ping failed:", error);
			return false;
		}
	}

	// Close Redis connection with graceful error handling
	async close(): Promise<void> {
		try {
			if (this.isConnected) {
				await this.client.quit();
				this.isConnected = false;
				console.log("Redis connection closed");
			}
		} catch (error) {
			console.error("Error closing Redis connection:", error);
			// Force disconnect if quit fails
			this.client.disconnect();
			this.isConnected = false;
		}
	}
}

// Export as singleton
const redisService = new RedisService();
export default redisService;
