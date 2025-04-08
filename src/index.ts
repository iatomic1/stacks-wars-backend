// src/index.ts
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { PORT } from "./config/constants";
import { errorHandler } from "./middleware/errorHandler";
// import apiRoutes from "./routes/api";
import redisService from "./services/redisService";
import { setupSocketHandlers } from "./sockets/socketHandler";

const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Error handling middleware
app.use(errorHandler);

// API routes
// app.use("/api", apiRoutes);

// Socket.io server
const io = new Server(server, {
	cors: {
		origin:
			process.env.NODE_ENV === "production"
				? [process.env.CLIENT_URL || ""]
				: ["*"],
		methods: ["GET", "POST"],
		credentials: true,
	},
	transports: ["polling", "websocket"],
});

// Setup socket handlers
setupSocketHandlers(io);

// Start server
server.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
	console.log("Server shutting down");

	// Close Redis connection
	await redisService.close(); // Use your RedisService

	server.close(() => {
		console.log("Server closed");
		process.exit(0);
	});
});

// Unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Uncaught exceptions
process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception:", error);

	if (process.env.NODE_ENV === "production") {
		console.error("Critical error, shutting down...");
		process.exit(1);
	}
});
