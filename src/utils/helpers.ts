// src/utils/helpers.ts
export const getRandomLetter = (): string => {
	return "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
};
