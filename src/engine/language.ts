export type WordLanguage = 'en' | 'ru';

export const DEFAULT_LANGUAGE: WordLanguage = 'en';

export const LANGUAGE_LABELS: Record<WordLanguage, string> = {
  en: 'English',
  ru: 'Russian',
};

export const LANGUAGE_KEY_ROWS: Record<WordLanguage, string[]> = {
  en: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
  ru: ['ЙЦУКЕНГШЩЗХЪ', 'ФЫВАПРОЛДЖЭ', 'ЯЧСМИТЬБЮ'],
};

const WORD_PATTERNS: Record<WordLanguage, RegExp> = {
  en: /^[a-z]{5}$/,
  ru: /^[а-яё]{5}$/u,
};

export function isWordLanguage(value: unknown): value is WordLanguage {
  return value === 'en' || value === 'ru';
}

export function isLanguageWord(word: string, language: WordLanguage): boolean {
  return WORD_PATTERNS[language].test(word.toLowerCase());
}

export function isGuessText(text: string): boolean {
  return /^\p{Letter}{5}$/u.test(text);
}
