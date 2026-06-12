import {
	MAX_WORD_LENGTH,
	MIN_WORD_LENGTH,
	type WordLanguage,
} from "../game/language.ts";

export type WordTarget = {
	word: string;
	language: WordLanguage;
};

const EN_WORD = /^[a-z]+$/i;
const RU_WORD = /^[а-яё]+$/iu;
const GUESS_COMMAND = /^\/w(?:@\w+)?$/i;

function wordLanguage(word: string): WordLanguage | null {
	if (EN_WORD.test(word)) return "en";
	if (RU_WORD.test(word)) return "ru";
	return null;
}

export function parseWordTarget(
	text: string | undefined,
	options: { allowGuessCommand?: boolean } = {},
): WordTarget | null {
	const parts = text?.trim().split(/\s+/).filter(Boolean) ?? [];
	let word: string | undefined;

	if (parts.length === 1) {
		word = parts[0];
	} else if (
		options.allowGuessCommand &&
		parts.length === 2 &&
		GUESS_COMMAND.test(parts[0])
	) {
		word = parts[1];
	}

	if (!word || word.length < MIN_WORD_LENGTH || word.length > MAX_WORD_LENGTH) {
		return null;
	}

	const language = wordLanguage(word);
	return language ? { word: word.toLowerCase(), language } : null;
}
