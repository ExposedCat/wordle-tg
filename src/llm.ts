import OpenAI from "@openai/openai";
import { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL } from "./config.ts";
import type { WordLanguage } from "./game/language.ts";
import { createLogger } from "./log.ts";

const log = createLogger("llm");

let client: OpenAI | null = null;
const SHORT_OUTPUT_TOKENS = 512;
const ROAST_OUTPUT_TOKENS = 192;
const ROAST_SEED_LENGTH = 100;
const ROAST_INSTRUCTIONS = [
	"Roast this bad Wordle guess: ",
	"Mock this doomed Wordle guess: ",
	"Give this awful Wordle guess the roast it earned: ",
	"Trash this cursed Wordle guess: ",
	"Roast the player for choosing this Wordle guess: ",
	"Make fun of this bad Wordle guess: ",
	"Skewer this miserable Wordle guess: ",
	"Drag this Wordle guess through the group chat: ",
	"Write a sharp roast for this Wordle guess: ",
	"Call out this terrible Wordle guess: ",
	"Give a sarcastic jab for this Wordle guess: ",
	"Punish this weak Wordle guess with one roast: ",
] as const;
const ROAST_RULES = [
	"Use nasty, sarcastic, dark savvy humor. Not boring, flat schoolyard humor, but a serious, sharp roasting.",
	"Reply in the same language/alphabet as the guessed word.",
	"Exactly one short sentence.",
	"Joke must be sarcastic, non-flat, and not too obvious. It must be deep and smart, and it must roast the guesser.",
	"You are strictly unallowed to use analogies or comparisons.",
	"Do not mention scores, numbers, possible words, remaining words, averages, or quality.",
] as const;
const EN_ROAST_EXAMPLES = [
	`"CRANE" -> "CRANE spent all that confidence and bought nothing."`,
	`"SLATE" -> "SLATE says you wanted strategy but settled for posture."`,
	`"AUDIO" -> "AUDIO announced that you discovered vowels and stopped thinking."`,
	`"RAISE" -> "RAISE was brave in the way bad decisions enjoy being witnessed."`,
	`"PLANT" -> "PLANT really committed to wasting everyone's emotional bandwidth."`,
	`"HOUSE" -> "HOUSE is what happens when your instincts clock out early."`,
	`"MONEY" -> "MONEY brought financial-crisis judgment to a five-letter problem."`,
	`"LIGHT" -> "LIGHT was impressively dim for something trying so hard."`,
	`"TRAIN" -> "TRAIN arrived late to the thought process and still derailed it."`,
	`"BREAD" -> "BREAD has the tragic confidence of a guess that learned nothing."`,
] as const;
const RU_ROAST_EXAMPLES = [
	`"МОРЕ" -> "МОРЕ выглядело уверенно, пока не стало ясно, что думать ты не начинал(a)."`,
	`"СТОЛ" -> "СТОЛ принес в чат ту самую тишину, после которой стыдно всем."`,
	`"ВЕТЕР" -> "ВЕТЕР был резким напоминанием, что интуиция тоже умеет увольняться."`,
	`"КОШКА" -> "КОШКА пришла с таким апломбом, будто провал заранее забронировали."`,
	`"СЛОВО" -> "СЛОВО звучит так, будто мысль застряла еще на заставке."`,
	`"КНИГА" -> "КНИГА доказала, что чтение не всегда оставляет следы."`,
	`"ПОЛЕ" -> "ПОЛЕ оставило после себя пространство, где могла быть идея."`,
	`"ДОЖДЬ" -> "ДОЖДЬ промочил не игру, а остатки твоей репутации."`,
	`"ЗВУК" -> "ЗВУК был громким только в своей бесполезности."`,
	`"КАРТА" -> "КАРТА явно не помогла, потому что ты заблудился еще до хода."`,
] as const;
const RANDOM_SEED_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

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

function randomInt(maxExclusive: number): number {
	return Math.floor(Math.random() * maxExclusive);
}

function randomSeed(length = ROAST_SEED_LENGTH): string {
	return Array.from(
		{ length },
		() => RANDOM_SEED_ALPHABET[randomInt(RANDOM_SEED_ALPHABET.length)],
	).join("");
}

function shuffled<T>(items: readonly T[]): T[] {
	const result = [...items];
	for (let index = result.length - 1; index > 0; index--) {
		const swapIndex = randomInt(index + 1);
		[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
	}
	return result;
}

function sample<T>(items: readonly T[], count: number): T[] {
	return shuffled(items).slice(0, count);
}

function roastExamplesForWord(word: string): readonly string[] {
	return /[А-Яа-яЁё]/.test(word) ? RU_ROAST_EXAMPLES : EN_ROAST_EXAMPLES;
}

function buildRoastPrompt(word: string): string {
	const instruction = ROAST_INSTRUCTIONS[randomInt(ROAST_INSTRUCTIONS.length)];
	const rules = shuffled(ROAST_RULES)
		.map((rule) => `- ${rule}`)
		.join("\n");
	const examples = sample(roastExamplesForWord(word), 3).join("\n");

	return `Seed: ${randomSeed()}
${instruction}${word}

Rules:
${rules}

Good examples:
${examples}
Seed: ${randomSeed()}`;
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
	const llmMeaning = await describeWordMeaningWithLLM(word, language);
	if (llmMeaning) return llmMeaning;

	const dictionaryMeaning = await fetchDictionaryMeaning(word, language);
	if (dictionaryMeaning) {
		log.debug("Received dictionary word meaning", {
			word,
			language,
			textLength: dictionaryMeaning.length,
		});
		return dictionaryMeaning;
	}

	return undefined;
}

async function describeWordMeaningWithLLM(
	word: string,
	language: WordLanguage,
): Promise<string | undefined> {
	const openai = openaiClient();
	if (!openai) return undefined;
	log.debug("Requesting word meaning", { word, language });

	try {
		const prompt = `In language ${language === "ru" ? "Russian" : "English"}, write a single short sentence explaining the most common meaning of the word "${word}". After that, add a second single sentence with a fun fact about that word.`;
		const response = await openai.responses.create({
			...shortResponseOptions(),
			instructions:
				"Return only two requested sentences (description + fun fact). Do NOT use markdown, labels, examples, or extra commentary!",
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
	} catch (error) {
		log.warn("Word meaning LLM failed; falling back to dictionary APIs", {
			word,
			language,
			error,
		});
		return undefined;
	}
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
	const prompt = buildRoastPrompt(word);
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
