// src/models/room.ts
import type { Player } from "./player";
import type { Rule } from "./rule";

export interface GameRoom {
	id: string;
	players: Player[];
	currentPlayerIndex: number;
	lastActive: Date;
	createdAt: Date;
	currentRule?: Rule;
	currentRuleIndex?: number;
	minWordLength?: number;
	usedWords?: Set<string>;
	timeLimit?: number;
	rulesCompleted?: number;
}
