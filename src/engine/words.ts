import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_WORD_LENGTH,
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
  isLanguageWord,
  isSupportedWordLength,
  type WordLanguage,
} from './language.js';

const DATA_DIR = process.env.WORDLE_DATA_DIR ?? join(process.cwd(), 'data');

interface WordJson {
  language: WordLanguage;
  length: number;
  valid: string[];
  possible: string[];
}

function loadJson(language: WordLanguage, length: number): { answers: string[]; valid: Set<string> } {
  const path = join(DATA_DIR, `${language}-${length}.json`);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<WordJson>;
  if (parsed.language !== language || parsed.length !== length || !Array.isArray(parsed.valid) || !Array.isArray(parsed.possible)) {
    throw new Error(`Invalid word data: ${path}`);
  }

  const valid = parsed.valid
    .map((w) => w.trim().toLowerCase())
    .filter((w) => isLanguageWord(w, language, length));
  const answers = parsed.possible
    .map((w) => w.trim().toLowerCase())
    .filter((w) => isLanguageWord(w, language, length));

  return { answers, valid: new Set([...valid, ...answers]) };
}

const LENGTHS = Array.from({ length: MAX_WORD_LENGTH - MIN_WORD_LENGTH + 1 }, (_, i) => MIN_WORD_LENGTH + i);
const LANGUAGES: WordLanguage[] = ['en', 'ru'];

const ANSWERS_BY_LANGUAGE_AND_LENGTH: Record<WordLanguage, Record<number, string[]>> = { en: {}, ru: {} };
const VALID_BY_LANGUAGE_AND_LENGTH: Record<WordLanguage, Record<number, Set<string>>> = { en: {}, ru: {} };

for (const language of LANGUAGES) {
  for (const length of LENGTHS) {
    const loaded = loadJson(language, length);
    ANSWERS_BY_LANGUAGE_AND_LENGTH[language][length] = loaded.answers;
    VALID_BY_LANGUAGE_AND_LENGTH[language][length] = loaded.valid;
  }
}

export const ANSWERS: string[] = ANSWERS_BY_LANGUAGE_AND_LENGTH.en[DEFAULT_WORD_LENGTH];
export const ANSWERS_RU: string[] = ANSWERS_BY_LANGUAGE_AND_LENGTH.ru[DEFAULT_WORD_LENGTH];

const ANSWERS_BY_LANGUAGE: Record<WordLanguage, string[]> = {
  en: ANSWERS,
  ru: ANSWERS_RU,
};

export function isValidWord(word: string, language: WordLanguage = 'en', length = DEFAULT_WORD_LENGTH): boolean {
  if (!isSupportedWordLength(length)) return false;
  return VALID_BY_LANGUAGE_AND_LENGTH[language][length]?.has(word.toLowerCase()) ?? false;
}

export function answersForLanguage(language: WordLanguage = 'en', length = DEFAULT_WORD_LENGTH): readonly string[] {
  if (length === DEFAULT_WORD_LENGTH) return ANSWERS_BY_LANGUAGE[language];
  return ANSWERS_BY_LANGUAGE_AND_LENGTH[language][length] ?? [];
}

/** Random answer, excluding any words in `exclude` (creativity mode). */
export function pickAnswer(language: WordLanguage = 'en', length = DEFAULT_WORD_LENGTH, exclude: Set<string> = new Set()): string {
  const answers = ANSWERS_BY_LANGUAGE_AND_LENGTH[language][length] ?? ANSWERS_BY_LANGUAGE[language];
  const pool = exclude.size ? answers.filter((w) => !exclude.has(w)) : answers;
  const from = pool.length ? pool : answers; // never brick the game if everything is excluded
  return from[Math.floor(Math.random() * from.length)];
}
