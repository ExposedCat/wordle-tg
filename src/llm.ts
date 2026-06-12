import OpenAI from "@openai/openai";
import { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL } from "./config.ts";
import type { WordLanguage } from "./engine/language.ts";
import { createLogger } from "./log.ts";

const log = createLogger("llm");

let client: OpenAI | null = null;
const SHORT_OUTPUT_TOKENS = 512;
const ROAST_OUTPUT_TOKENS = 192;

function openaiClient(): OpenAI | null {
	if (!OPENAI_API_KEY) return null;
	client ??= new OpenAI({
		apiKey: OPENAI_API_KEY,
		baseURL: OPENAI_BASE_URL,
	});
	return client;
}

function shortResponseOptions(maxOutputTokens = SHORT_OUTPUT_TOKENS) {
	return {
		model: OPENAI_MODEL,
		max_output_tokens: maxOutputTokens,
	};
}

export function hasOpenAIKey(): boolean {
	return OPENAI_API_KEY.length > 0;
}

interface DictionaryApiEntry {
	meanings?: {
		definitions?: {
			definition?: string;
		}[];
	}[];
}

interface WiktionaryQueryResponse {
	query?: {
		pages?: Record<string, { extract?: string }>;
	};
}

const DEFINITION_TIMEOUT_MS = 4000;
const MAX_DEFINITION_LENGTH = 300;
const SECTION_AFTER_MEANING =
	/^(Синонимы|Антонимы|Гиперонимы|Гипонимы|Согипонимы|Холонимы|Меронимы|Родственные слова|Этимология|Фразеологизмы|Перевод|Библиография|Анаграммы)/;

function formatDictionaryMeaning(word: string, definition: string): string {
	return `📖 ${word.toUpperCase()} — ${definition.slice(
		0,
		MAX_DEFINITION_LENGTH,
	)}`;
}

async function fetchEnglishDefinition(word: string): Promise<string | null> {
	try {
		const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
			word,
		)}`;
		const res = await fetch(url, {
			signal: AbortSignal.timeout(DEFINITION_TIMEOUT_MS),
		});
		if (!res.ok) return null;

		const entries = (await res.json()) as DictionaryApiEntry[];
		const definition = entries
			.flatMap((entry) => entry.meanings ?? [])
			.flatMap((meaning) => meaning.definitions ?? [])
			.map((item) => item.definition?.trim())
			.find((item): item is string => Boolean(item));

		return definition ? formatDictionaryMeaning(word, definition) : null;
	} catch {
		return null;
	}
}

async function fetchRussianDefinition(word: string): Promise<string | null> {
	try {
		const params = new URLSearchParams({
			action: "query",
			prop: "extracts",
			explaintext: "1",
			exsectionformat: "plain",
			format: "json",
			redirects: "1",
			titles: word,
		});
		const res = await fetch(`https://ru.wiktionary.org/w/api.php?${params}`, {
			signal: AbortSignal.timeout(DEFINITION_TIMEOUT_MS),
		});
		if (!res.ok) return null;

		const data = await res.json();
		const pages =
			typeof data === "object" && data !== null && "query" in data
				? (data as WiktionaryQueryResponse).query?.pages
				: undefined;
		const page = Object.values(pages ?? {}).at(0);
		const definition = firstRussianMeaning(page?.extract ?? "");

		return definition ? formatDictionaryMeaning(word, definition) : null;
	} catch {
		return null;
	}
}

async function fetchDictionaryMeaning(
	word: string,
	language: WordLanguage,
): Promise<string | null> {
	return language === "ru"
		? await fetchRussianDefinition(word)
		: await fetchEnglishDefinition(word);
}

/** Pull the first meaning line out of a ru.wiktionary plain-text extract. */
export function firstRussianMeaning(extract: string): string | null {
	const lines = extract.split("\n").map((line) => line.trim());
	const start = lines.indexOf("Значение");
	if (start === -1) return null;

	for (const line of lines.slice(start + 1)) {
		if (!line) continue;
		if (SECTION_AFTER_MEANING.test(line)) break;

		const definition = line.split("◆")[0].trim();
		if (definition && definition !== "?" && definition.length > 2) {
			return definition;
		}
	}
	return null;
}

export async function describeWordMeaning(
	word: string,
	language: WordLanguage,
): Promise<string | undefined> {
	const dictionaryMeaning = await fetchDictionaryMeaning(word, language);
	if (dictionaryMeaning) {
		log.debug("Received dictionary word meaning", {
			word,
			language,
			textLength: dictionaryMeaning.length,
		});
		return dictionaryMeaning;
	}

	const openai = openaiClient();
	if (!openai) return undefined;
	log.debug("Requesting word meaning", { word, language });

	const prompt = `Write a single-sentence complete and concise meaning(s) of the word "${word}", using word's language.`;
	const response = await openai.responses.create({
		...shortResponseOptions(),
		instructions:
			"Return only the requested sentence. Do not use markdown, labels, examples, or extra commentary.",
		input: prompt,
	});

	const text = response.output_text.trim();
	log.debug("Received word meaning response", {
		word,
		language,
		responseId: response.id,
		status: response.status,
		textLength: text.length,
	});
	return text.length > 0 ? text : undefined;
}

export async function roastBadGuess(input: {
	playerName: string;
	word: string;
	possibleCount: number;
	actualRemaining: number;
	averageRemaining: number;
}): Promise<string | undefined> {
	const openai = openaiClient();
	if (!openai) return undefined;

	const word = input.word.toUpperCase();
	log.debug("Requesting guess roast", {
		word,
		possibleCount: input.possibleCount,
		actualRemaining: input.actualRemaining,
		averageRemaining: input.averageRemaining,
	});
	const prompt = `Roast this bad Wordle guess: ${word}

Rules:
- Use nasty, sarcastic, dark savvy humor.
- Reply in the same language/alphabet as the guessed word.
- Exactly one short sentence.
- Sound like an annoyed friend in a group chat.
- Make the joke about this exact word.
- Joke must be sarcastic, non-flat, and not too obvious. It must be deep and smart, and it must roast the guesser.
- Do not mention scores, numbers, possible words, remaining words, averages, or quality.`;
	const response = await openai.responses.create({
		...shortResponseOptions(ROAST_OUTPUT_TOKENS),
		instructions:
			"Return only the roast sentence. No markdown, no labels, no setup, no explanation.",
		input: prompt,
	});

	const text = response.output_text.trim();
	log.debug("Received guess roast response", {
		word,
		responseId: response.id,
		status: response.status,
		textLength: text.length,
	});
	if (text.length === 0) {
		log.warn("Roast LLM returned empty output", {
			word,
			responseId: response.id,
			status: response.status,
			error: response.error,
			incompleteDetails: response.incomplete_details,
		});
		return undefined;
	}
	return text;
}
