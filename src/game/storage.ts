import type {
	DailyWordRow,
	Database,
	GameKind,
	GameRow,
	GameSqlRow,
} from "../app/schema.ts";
import { normalizeSqlRow } from "../app/sql.ts";
import {
	DEFAULT_LANGUAGE,
	isWordLanguage,
	type WordLanguage,
} from "./language.ts";

function parseGame(row: GameSqlRow): GameRow {
	row = normalizeSqlRow(row);
	return {
		...row,
		language: isWordLanguage(row.language) ? row.language : DEFAULT_LANGUAGE,
		guesses: JSON.parse(row.guesses),
		daily_date: row.daily_date ?? null,
	};
}

export async function getActiveGame(
	db: Database,
	chatId: number,
): Promise<GameRow | null> {
	const row = await db
		.selectFrom("games")
		.selectAll()
		.where("chat_id", "=", chatId)
		.where("status", "=", "active")
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();
	return row ? parseGame(row) : null;
}

export async function getGame(
	db: Database,
	id: number,
): Promise<GameRow | null> {
	const row = await db
		.selectFrom("games")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
	return row ? parseGame(row) : null;
}

export async function createGame(
	db: Database,
	chatId: number,
	answer: string,
	language: WordLanguage,
	kind: GameKind = "normal",
	opts: { tournamentId?: number; duelId?: number; dailyDate?: string } = {},
): Promise<GameRow> {
	const now = Date.now();
	const result = await db
		.insertInto("games")
		.values({
			chat_id: chatId,
			answer,
			language,
			kind,
			started_at: now,
			finished_at: null,
			tournament_id: opts.tournamentId ?? null,
			duel_id: opts.duelId ?? null,
			daily_date: opts.dailyDate ?? null,
		})
		.executeTakeFirst();
	return (await getGame(db, Number(result.insertId)))!;
}

export function updateGame(db: Database, game: GameRow): Promise<void> {
	return db
		.updateTable("games")
		.set({
			status: game.status,
			guesses: JSON.stringify(game.guesses),
			finished_at: game.finished_at,
		})
		.where("id", "=", game.id)
		.execute()
		.then(() => {});
}

export async function getDailyWord(
	db: Database,
	date: string,
	language: WordLanguage,
): Promise<DailyWordRow | null> {
	const row = normalizeSqlRow(
		await db
			.selectFrom("daily_words")
			.selectAll()
			.where("date", "=", date)
			.where("language", "=", language)
			.executeTakeFirst(),
	);
	if (!row || !isWordLanguage(row.language)) return null;
	return { ...row, language: row.language };
}

export function saveDailyWord(
	db: Database,
	date: string,
	language: WordLanguage,
	word: string,
): Promise<void> {
	return db
		.insertInto("daily_words")
		.values({
			date,
			language,
			word: word.toLowerCase(),
			fetched_at: Date.now(),
		})
		.onConflict((oc) => oc.columns(["date", "language"]).doNothing())
		.execute()
		.then(() => {});
}

export async function getCompletedDailyGame(
	db: Database,
	chatId: number,
	date: string,
	language: WordLanguage,
): Promise<GameRow | null> {
	const row = await db
		.selectFrom("games")
		.selectAll()
		.where("chat_id", "=", chatId)
		.where("daily_date", "=", date)
		.where("language", "=", language)
		.where("kind", "=", "normal")
		.where("status", "in", ["solved", "lost"])
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();
	return row ? parseGame(row) : null;
}

export async function getPausedDailyGame(
	db: Database,
	chatId: number,
	date: string,
	language: WordLanguage,
): Promise<GameRow | null> {
	const row = await db
		.selectFrom("games")
		.selectAll()
		.where("chat_id", "=", chatId)
		.where("daily_date", "=", date)
		.where("language", "=", language)
		.where("kind", "=", "normal")
		.where("status", "=", "paused")
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();
	return row ? parseGame(row) : null;
}
