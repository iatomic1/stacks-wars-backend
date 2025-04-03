import words from "an-array-of-english-words";

export const isValidWord = (word: string): boolean => {
  return words.includes(word.toLowerCase());
};

export const calculateWordScore = (word: string): number => {
  return 1;
};
