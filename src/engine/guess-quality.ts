import { scoreGuess, type TileStatus } from './score.js';

export interface GuessQuality {
  possibleCount: number;
  actualRemaining: number;
  averageRemaining: number;
  points: number;
}

export interface GuessRemaining {
  possibleCount: number;
  actualRemaining: number;
}

function scoreKey(score: TileStatus[]): string {
  return score.map((status) => status[0]).join('');
}

const averageRemainingCache = new Map<string, number>();
const MAX_BASELINE_GUESSES = 128;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function qualityPoints(remaining: number, averageRemaining: number): number {
  if (remaining <= 1 || averageRemaining <= 1) return 100;
  return clamp(Math.round(100 - (50 * (remaining - 1)) / (averageRemaining - 1)), 0, 100);
}

export function possibleSecretWords(
  answer: string,
  previousGuesses: readonly string[],
  answers: readonly string[]
): string[] {
  const feedback = previousGuesses.map((guess) => scoreKey(scoreGuess(answer, guess)));

  return answers.filter((candidate) =>
    previousGuesses.every((guess, index) => scoreKey(scoreGuess(candidate, guess)) === feedback[index])
  );
}

function actualRemainingForGuess(answer: string, guess: string, possible: readonly string[]): number {
  const patternCounts = new Map<string, number>();
  for (const candidate of possible) {
    const key = scoreKey(scoreGuess(candidate, guess));
    patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
  }
  return patternCounts.get(scoreKey(scoreGuess(answer, guess))) ?? 0;
}

export function remainingAfterGuess(
  answer: string,
  previousGuesses: readonly string[],
  guess: string,
  answers: readonly string[]
): GuessRemaining {
  const possible = possibleSecretWords(answer, previousGuesses, answers);
  if (!possible.length) return { possibleCount: 0, actualRemaining: 0 };

  return {
    possibleCount: possible.length,
    actualRemaining: actualRemainingForGuess(answer, guess, possible),
  };
}

export function guessQuality(
  answer: string,
  previousGuesses: readonly string[],
  guess: string,
  answers: readonly string[]
): GuessQuality {
  const possible = possibleSecretWords(answer, previousGuesses, answers);
  if (!possible.length) return { possibleCount: 0, actualRemaining: 0, averageRemaining: 0, points: 0 };

  const actualRemaining = actualRemainingForGuess(answer, guess, possible);
  const averageRemaining = averageRemainingForState(possible);

  return {
    possibleCount: possible.length,
    actualRemaining,
    averageRemaining,
    points: qualityPoints(actualRemaining, averageRemaining),
  };
}

function expectedRemainingForGuess(possible: readonly string[], guess: string): number {
  const patternCounts = new Map<string, number>();
  for (const candidate of possible) {
    const key = scoreKey(scoreGuess(candidate, guess));
    patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
  }

  let weightedRemaining = 0;
  for (const count of patternCounts.values()) weightedRemaining += count * count;
  return weightedRemaining / possible.length;
}

function averageRemainingForState(possible: readonly string[]): number {
  const key = possible.join('\0');
  const cached = averageRemainingCache.get(key);
  if (cached !== undefined) return cached;

  const guesses = baselineGuesses(possible);
  let total = 0;
  for (const guess of guesses) total += expectedRemainingForGuess(possible, guess);
  const average = total / guesses.length;
  averageRemainingCache.set(key, average);
  return average;
}

function baselineGuesses(possible: readonly string[]): readonly string[] {
  if (possible.length <= MAX_BASELINE_GUESSES) return possible;

  const guesses: string[] = [];
  const step = possible.length / MAX_BASELINE_GUESSES;
  for (let i = 0; i < MAX_BASELINE_GUESSES; i++) {
    guesses.push(possible[Math.floor(i * step)]);
  }
  return guesses;
}
