import { type Database, getDailyWord, saveDailyWord } from "../app/data.ts";
import { createLogger } from "../log.ts";
import {
	DEFAULT_WORD_LENGTH,
	isLanguageWord,
	type WordLanguage,
} from "./language.ts";
import { pickAnswer } from "./words.ts";

const log = createLogger("game:daily");

type FetchLike = typeof fetch;

export const DAILY_TIME_ZONE = "Europe/Prague";

export function dateKey(date: Date, timeZone = DAILY_TIME_ZONE): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const values = Object.fromEntries(
		parts.map((part) => [part.type, part.value]),
	);
	const year = values.year;
	const month = values.month;
	const day = values.day;

	if (!year || !month || !day) {
		throw new Error(`Could not format date key for timezone ${timeZone}`);
	}

	return `${year}-${month}-${day}`;
}

async function fetchNytWordleAnswer(
	date: string,
	fetchImpl: FetchLike,
): Promise<string> {
	const url = `https://www.nytimes.com/svc/wordle/v2/${date}.json`;
	log.debug("Fetching NYT daily Wordle", { date, url });
	const response = await fetchImpl(url);
	if (!response.ok) {
		throw new Error(`NYT Wordle fetch failed: ${response.status}`);
	}

	const payload = (await response.json()) as { solution?: unknown };
	const solution =
		typeof payload.solution === "string"
			? payload.solution.toLowerCase()
			: null;
	if (!solution || !isLanguageWord(solution, "en", DEFAULT_WORD_LENGTH)) {
		throw new Error("NYT Wordle response did not contain a valid solution");
	}
	return solution;
}

export async function dailyAnswer(
	db: Database,
	date: string,
	language: WordLanguage,
	fetchImpl: FetchLike,
): Promise<string> {
	const existing = await getDailyWord(db, date, language);
	if (existing) {
		log.debug("Daily answer cache hit", { date, language });
		return existing.word;
	}

	const answer =
		language === "en"
			? await fetchNytWordleAnswer(date, fetchImpl)
			: pickAnswer("ru", DEFAULT_WORD_LENGTH);

	await saveDailyWord(db, date, language, answer);
	log.debug("Saved daily answer", { date, language });
	return (await getDailyWord(db, date, language))?.word ?? answer;
}
