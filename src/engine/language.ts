export type WordLanguage = 'en' | 'ru';

export const DEFAULT_LANGUAGE: WordLanguage = 'en';
export const DEFAULT_WORD_LENGTH = 5;
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 10;

export const LANGUAGE_LABELS: Record<WordLanguage, string> = {
  en: 'English',
  ru: 'Russian',
};

export const LANGUAGE_KEY_ROWS: Record<WordLanguage, string[]> = {
  en: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
  ru: ['ЙЦУКЕНГШЩЗХЪ', 'ФЫВАПРОЛДЖЭ', 'ЯЧСМИТЬБЮ'],
};

const WORD_PATTERNS: Record<WordLanguage, RegExp> = {
  en: /^[a-z]+$/,
  ru: /^[а-яё]+$/u,
};

export function isWordLanguage(value: unknown): value is WordLanguage {
  return value === 'en' || value === 'ru';
}

export function isSupportedWordLength(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_WORD_LENGTH && value <= MAX_WORD_LENGTH;
}

export function isLanguageWord(word: string, language: WordLanguage, length = DEFAULT_WORD_LENGTH): boolean {
  const normalized = word.toLowerCase();
  return normalized.length === length && WORD_PATTERNS[language].test(normalized);
}

export function isGuessText(text: string, length = DEFAULT_WORD_LENGTH): boolean {
  return isSupportedWordLength(length) && new RegExp(`^\\p{Letter}{${length}}$`, 'u').test(text);
}
