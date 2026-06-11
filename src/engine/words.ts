import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLanguageWord, type WordLanguage } from './language.js';

const DATA_DIR = process.env.WORDLE_DATA_DIR ?? join(process.cwd(), 'data');

function loadList(file: string, language: WordLanguage): string[] {
  return readFileSync(join(DATA_DIR, file), 'utf8')
    .split('\n')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => isLanguageWord(w, language));
}

export const ANSWERS: string[] = loadList('answers.txt', 'en');
export const ANSWERS_RU: string[] = loadList('answers-ru.txt', 'ru');

const ANSWERS_BY_LANGUAGE: Record<WordLanguage, string[]> = {
  en: ANSWERS,
  ru: ANSWERS_RU,
};

const VALID_BY_LANGUAGE: Record<WordLanguage, Set<string>> = {
  en: new Set([...ANSWERS, ...loadList('allowed.txt', 'en')]),
  ru: new Set([...ANSWERS_RU, ...loadList('allowed-ru.txt', 'ru')]),
};

export function isValidWord(word: string, language: WordLanguage = 'en'): boolean {
  return VALID_BY_LANGUAGE[language].has(word.toLowerCase());
}

export function answersForLanguage(language: WordLanguage = 'en'): readonly string[] {
  return ANSWERS_BY_LANGUAGE[language];
}

/** Random answer, excluding any words in `exclude` (creativity mode). */
export function pickAnswer(language: WordLanguage = 'en', exclude: Set<string> = new Set()): string {
  const answers = ANSWERS_BY_LANGUAGE[language];
  const pool = exclude.size ? answers.filter((w) => !exclude.has(w)) : answers;
  const from = pool.length ? pool : answers; // never brick the game if everything is excluded
  return from[Math.floor(Math.random() * from.length)];
}
