import OpenAI from "@openai/openai";
import { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL } from "./config.ts";

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

export async function describeWordMeaning(
	word: string,
): Promise<string | undefined> {
	const openai = openaiClient();
	if (!openai) return undefined;

	const prompt = `Write a single-sentence complete and concise meaning(s) of the word "${word}", using word's language.`;
	const response = await openai.responses.create({
		...shortResponseOptions(),
		instructions:
			"Return only the requested sentence. Do not use markdown, labels, examples, or extra commentary.",
		input: prompt,
	});

	const text = response.output_text.trim();
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
	if (text.length === 0) {
		console.error("Roast LLM returned empty output", {
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
