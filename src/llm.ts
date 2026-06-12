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
	"Roast this bad Wordle guess with one nasty line: ",
	"Mock the player for choosing this Wordle guess: ",
	"Give this pathetic Wordle choice the roast it earned: ",
	"Drag the player for making this Wordle guess: ",
	"Write a vicious group-chat roast for this Wordle guess: ",
	"Call out the awful thought process behind this Wordle guess: ",
	"Skewer the confidence behind this Wordle guess: ",
	"Give one cruel sarcastic roast for this bad Wordle guess: ",
] as const;
const ROAST_RULES = [
	"Use the guessed word as a hook only when it makes the insult sharper; never force cute puns or dictionary jokes.",
	"Use nasty adult group-chat sarcasm: cruel, savvy, profane, and personal.",
	"Strong profanity is allowed; slurs, hate, and threats are not.",
	"Reply in the same language/alphabet as the guessed word.",
	"Exactly one short sentence.",
	"Avoid whimsy, softened insults, rhymes, random metaphors, and schoolyard punchlines.",
	"Make the roast about wasted confidence, bad instincts, shallow thinking, or a fake strategy collapsing.",
	"It should feel like a mean Telegram reply from a clever friend, not edgy shock bait from an assistant.",
	"Do not mention scores, numbers, possible words, remaining words, averages, or quality.",
] as const;
const EN_ROAST_EXAMPLES = [
	`"SPINE" -> "Maybe grow one before making another guess this fucking useless."`,
	`"CHALK" -> "That word is so basic it makes your whole thought process look like complete shit."`,
	`"TRUMP" -> "Of all the dumb bullshit you could drag into Wordle, you chose the one that makes you look loud and lost."`,
	`"CRANE" -> "You used the default nerd opener and still made it look like you fucked it up on purpose."`,
	`"SLATE" -> "That is not strategy, that is copying confident people while understanding absolutely fuck-all."`,
	`"AUDIO" -> "You picked vowels like a lazy dumbass and expected everyone to call it tactics."`,
	`"RAISE" -> "Nothing says empty confidence like making a lazy-ass guess and waiting for the game to respect it."`,
	`"PLANT" -> "You planted that guess and proved your decision-making grows nothing but bullshit."`,
	`"HOUSE" -> "That guess makes your instincts look like they were assembled from leftover shit."`,
	`"MONEY" -> "You spent a turn like someone who is somehow dogshit at both budgeting and thinking."`,
	`"LIGHT" -> "There is nothing bright about picking that and pretending it was a fucking plan."`,
	`"BREAD" -> "That was stale enough to make everyone wonder why the fuck you were allowed near the board."`,
] as const;
const RU_ROAST_EXAMPLES = [
	`"МОРЕ" -> "С таким ходом тебе лучше молча утонуть, пока чат не заметил, насколько все проебано."`,
	`"СТОЛ" -> "Ты положил это на стол так уверенно, будто хуевая идея уже считается стратегией."`,
	`"ВЕТЕР" -> "В голове явно ветер, потому что нормальная мысль там бы нихуя не выжила."`,
	`"КОШКА" -> "Даже случайный тык по клавиатуре выглядел бы менее жалко, чем эта хуйня."`,
	`"СЛОВО" -> "Это не ход, а признание, что думать сегодня было слишком дохуя работы."`,
	`"КНИГА" -> "Если ты так читаешь доску, блядь, страшно представить, как ты читаешь предложения."`,
	`"ПОЛЕ" -> "Ты посеял плохую идею и почему-то ждал, что из этой хуйни вырастет мозг."`,
	`"ДОЖДЬ" -> "Этот ход смыл не варианты, а последние причины уважать твою ебаную интуицию."`,
	`"ЗВУК" -> "Громко было только от того, как твоя стратегия ебнулась лицом вниз."`,
	`"КАРТА" -> "С такой картой ты бы заблудился даже в собственном жалком оправдании."`,
	`"ДЕНЬГИ" -> "Ты вложился в этот ход так, будто банкротство мышления было ебаной целью."`,
	`"СВЕТ" -> "Для слова про свет ход получился слишком верным темноте в твоей, блядь, голове."`,
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

function buildRoastPrompt(input: {
	word: string;
	possibleCount: number;
	actualRemaining: number;
	averageRemaining: number;
}): string {
	const instruction = ROAST_INSTRUCTIONS[randomInt(ROAST_INSTRUCTIONS.length)];
	const rules = shuffled(ROAST_RULES)
		.map((rule) => `- ${rule}`)
		.join("\n");
	const examples = sample(roastExamplesForWord(input.word), 3).join("\n");

	return `Seed: ${randomSeed()}
${instruction}${input.word}

Private game context, for tone only:
- Possible words before the guess: ${input.possibleCount}
- Words left after the guess: ${input.actualRemaining}
- Expected words left for an average guess: ${input.averageRemaining}

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
	const prompt = buildRoastPrompt({
		word,
		possibleCount: input.possibleCount,
		actualRemaining: input.actualRemaining,
		averageRemaining: input.averageRemaining,
	});
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
