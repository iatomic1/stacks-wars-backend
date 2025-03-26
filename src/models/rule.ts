import { getRandomLetter } from "@/utils/helpers";
import type { GameRoom } from "./room";

export interface Rule {
  rule: string;
  validator: (word: string) => boolean;
}

export const generateRules = (
  minWordLength: number,
  randomLetter: string,
): Rule[] => [
  {
    rule: `Word must be at least ${minWordLength} characters!`,
    validator: (word: string) => word.length >= minWordLength,
  },
  {
    rule: `Word must contain the letter '${randomLetter}' and be at least ${minWordLength} characters long`,
    validator: (word: string) => word.includes(randomLetter),
  },
  {
    rule: `Word must NOT contain the letter '${randomLetter}' and be at least ${minWordLength} characters long`,
    validator: (word: string) => !word.includes(randomLetter),
  },
  {
    rule: `Word must start with the letter '${randomLetter}' and be at least ${minWordLength} characters long`,
    validator: (word: string) => word.startsWith(randomLetter),
  },
  {
    rule: `Word must end with the letter '${randomLetter}' and be at least ${minWordLength} characters long`,
    validator: (word: string) => word.endsWith(randomLetter),
  },
  {
    rule: `Word must end with 'tion' and be at least ${minWordLength} characters long`,
    validator: (word: string) => word.endsWith("tion"),
  },
  {
    rule: `Word must start with 'co' and be at least ${minWordLength} characters long`,
    validator: (word: string) => word.startsWith("co"),
  },
  {
    rule: `Word must contain at least two pairs of double letters and be at least ${minWordLength} characters long`,
    validator: (word: string) => {
      const doubleLetterMatch = word.match(/([a-z])\1/gi);
      return doubleLetterMatch !== null && doubleLetterMatch.length >= 2;
    },
  },
  {
    rule: `Word must have exactly ${minWordLength + 2} letters`,
    validator: (word: string) => word.length === minWordLength + 2,
  },
  {
    rule: `Word must start and end with a consonant and be at least ${minWordLength} characters long`,
    validator: (word: string) =>
      /^[bcdfghjklmnpqrstvwxyz].*[bcdfghjklmnpqrstvwxyz]$/i.test(word),
  },
  {
    rule: `Word must start and end with a vowel and be at least ${minWordLength} characters long`,
    validator: (word: string) => /^[aeiou].*[aeiou]$/i.test(word),
  },
  {
    rule: `Word must contain at least one letter that appears exactly three times and be at least ${minWordLength} characters long`,
    validator: (word: string) => {
      const letterCounts: Record<string, number> = {};
      for (const letter of word) {
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
      }
      return Object.values(letterCounts).some((count) => count === 3);
    },
  },
  {
    rule: `Word must be a palindrome and be at least ${minWordLength} characters long`,
    validator: (word: string) => {
      const reversed = word.split("").reverse().join("");
      return word === reversed;
    },
  },
  {
    rule: `Word must have no repeating letters and be at least ${minWordLength} characters long`,
    validator: (word: string) => {
      const uniqueLetters = new Set(word);
      return uniqueLetters.size === word.length;
    },
  },
  {
    rule: `Word must contain exactly 3 vowels and 3 consonants and be at least ${minWordLength} characters long`,
    validator: (word: string) => {
      const vowels = (word.match(/[aeiou]/gi) || []).length;
      const consonants = (word.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length;
      return vowels === 3 && consonants === 3;
    },
  },
  {
    rule: `Word must contain the same letter three times and be at least ${minWordLength} characters long`,
    validator: (word: string) => {
      const letterCounts: Record<string, number> = {};
      for (const letter of word) {
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
      }
      return Object.values(letterCounts).includes(3);
    },
  },
  {
    rule: `Word must have an equal number of vowels and consonants and be at least ${minWordLength} characters long`,
    validator: (word: string) => {
      const vowels = (word.match(/[aeiou]/gi) || []).length;
      const consonants = (word.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length;
      return vowels === consonants;
    },
  },
];

export const getNextRule = (room: GameRoom): Rule => {
  if (!room.currentRuleIndex) {
    room.currentRuleIndex = 0;
  }

  const letter = getRandomLetter();
  const rules = generateRules(room.minWordLength || 4, letter);

  room.currentRuleIndex = (room.currentRuleIndex + 1) % rules.length;

  return rules[room.currentRuleIndex];
};
