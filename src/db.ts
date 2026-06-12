import { Database as SqliteDatabase } from "@db/sqlite";
import { type ColumnType, Kysely, sql } from "@kysely/kysely";
import { DenoSqlite3Dialect } from "@marshift/kysely-deno-sqlite3";
import {
	DEFAULT_LANGUAGE,
	DEFAULT_WORD_LENGTH,
	isSupportedWordLength,
	isWordLanguage,
	type WordLanguage,
} from "./engine/language.ts";
import {
	type EmojiPackConfig,
	isEmojiPackConfig,
} from "./render/emoji-pack.ts";

type GeneratedColumn<T> = ColumnType<T, never, never>;
type DefaultColumn<T> = ColumnType<T, T | undefined, T>;

export type Database = Kysely<DatabaseSchema>;

function normalizeSqlValue(value: unknown): unknown {
	return typeof value === "bigint" ? Number(value) : value;
}

function normalizeSqlRow<T>(row: T): T {
	if (row === null || typeof row !== "object") return row;

	return Object.fromEntries(
		Object.entries(row as Record<string, unknown>).map(([key, value]) => [
			key,
			normalizeSqlValue(value),
		]),
	) as T;
}

function normalizeSqlRows<T>(rows: T[]): T[] {
	return rows.map(normalizeSqlRow);
}

export interface CreativitySettings {
	enabled: boolean;
	configured: boolean;
	mode: "time" | "count";
	/** time window in seconds (mode === 'time') */
	seconds: number;
	/** last N words (mode === 'count') */
	count: number;
}

export type Difficulty = "normal" | "hard" | "superhard";
export type OneshotDifficulty = "easy" | "normal" | "hard" | "expert";

export interface ChatSettings {
	language: WordLanguage;
	wordLength: number;
	bareWord: boolean;
	cleanup: boolean;
	roast: boolean;
	difficulty: Difficulty;
	oneshotDifficulty: OneshotDifficulty;
	creativity: CreativitySettings;
	emojiPack: EmojiPackConfig | null;
	/** Tournament rejected guesses allowed per turn; null = unlimited. */
	tournamentMaxFails: number | null;
	/** Tournament turn timer in seconds; null = disabled. */
	tournamentTurnSeconds: number | null;
}

export const DEFAULT_SETTINGS: ChatSettings = {
	language: DEFAULT_LANGUAGE,
	wordLength: DEFAULT_WORD_LENGTH,
	bareWord: false,
	cleanup: false,
	roast: false,
	difficulty: "normal",
	oneshotDifficulty: "normal",
	creativity: {
		enabled: false,
		configured: false,
		mode: "time",
		seconds: 3600,
		count: 20,
	},
	emojiPack: null,
	tournamentMaxFails: 5,
	tournamentTurnSeconds: null,
};

export interface GuessEntry {
	word: string;
	userId: number;
	userName: string;
	ts: number;
}

export type GameKind = "normal" | "tournament" | "duel" | "oneshot";
export type GameStatus = "active" | "paused" | "solved" | "lost";

export interface GameRow {
	id: number;
	chat_id: number;
	answer: string;
	language: WordLanguage;
	status: GameStatus;
	kind: GameKind;
	guesses: GuessEntry[];
	started_at: number;
	finished_at: number | null;
	tournament_id: number | null;
	duel_id: number | null;
	daily_date: string | null;
}

type GameSqlRow = Omit<GameRow, "guesses" | "language"> & {
	language: string;
	guesses: string;
};

export interface DailyWordRow {
	date: string;
	language: WordLanguage;
	word: string;
	fetched_at: number;
}

export type TournamentStatus = "joining" | "active" | "done" | "cancelled";

export interface TournamentPlayer {
	userId: number;
	userName: string;
	username?: string;
	firstName?: string;
}

export interface TournamentRow {
	id: number;
	chat_id: number;
	rounds: number;
	current_round: number; // 1-based
	status: TournamentStatus;
	players: TournamentPlayer[];
	scores: Record<string, number>; // userId -> points
	turn_idx: number; // index into rotated order of the current round
	fail_count: number; // rejected guesses by the current player this turn
	turn_started_at: number | null;
	message_thread_id: number | null;
	created_by: number;
}

type TournamentSqlRow = Omit<TournamentRow, "players" | "scores"> & {
	players: string;
	scores: string;
};

export type DuelStatus = "pending" | "active" | "done" | "cancelled";

export interface DuelPlayerResult {
	userId: number;
	userName: string;
	guesses: number | null; // null = not finished
	solved: boolean;
	ms: number | null; // time to finish
}

export interface DuelRow {
	id: number;
	chat_id: number; // group chat where the duel was created/announced
	message_thread_id: number | null; // forum topic where the duel was created/announced
	answer: string;
	status: DuelStatus;
	challenger: DuelPlayerResult;
	opponent: DuelPlayerResult | null;
}

type DuelSqlRow = Omit<DuelRow, "challenger" | "opponent"> & {
	challenger: string;
	opponent: string | null;
};

const PERSONAL_SCOPE_BASE = -1_000_000_000_000_000;

export interface StatsRow {
	chat_id: number;
	user_id: number;
	name: string;
	games_played: number;
	games_won: number; // games the player participated in that were solved (by anyone)
	solves: number; // games where THIS player's guess was the winning one
	guesses_total: number;
	guess_quality_count: number;
	guess_expected_remaining_sum: number;
	guess_quality_points_sum: number;
	greens: number;
	yellows: number;
	current_streak: number;
	best_streak: number;
	dist1: number;
	dist2: number;
	dist3: number;
	dist4: number;
	dist5: number;
	dist6: number;
	fastest_ms: number | null;
	tournaments_played: number;
	tournaments_won: number;
	tournament_points: number;
	duels_played: number;
	duels_won: number;
}

export type DatabaseSchema = {
	chats: {
		chat_id: number;
		settings: string;
	};
	games: {
		id: GeneratedColumn<number>;
		chat_id: number;
		answer: string;
		language: DefaultColumn<string>;
		status: DefaultColumn<GameStatus>;
		kind: DefaultColumn<GameKind>;
		guesses: DefaultColumn<string>;
		started_at: number;
		finished_at: number | null;
		tournament_id: number | null;
		duel_id: number | null;
		daily_date: string | null;
	};
	daily_words: {
		date: string;
		language: string;
		word: string;
		fetched_at: number;
	};
	used_words: {
		id: GeneratedColumn<number>;
		chat_id: number;
		word: string;
		used_at: number;
	};
	tournaments: {
		id: GeneratedColumn<number>;
		chat_id: number;
		rounds: number;
		current_round: DefaultColumn<number>;
		status: DefaultColumn<TournamentStatus>;
		players: DefaultColumn<string>;
		scores: DefaultColumn<string>;
		turn_idx: DefaultColumn<number>;
		fail_count: DefaultColumn<number>;
		turn_started_at: number | null;
		message_thread_id: number | null;
		created_by: number;
	};
	duels: {
		id: GeneratedColumn<number>;
		chat_id: number;
		message_thread_id: number | null;
		answer: string;
		status: DefaultColumn<DuelStatus>;
		challenger: string;
		opponent: string | null;
	};
	board_messages: {
		chat_id: number;
		thread_id: number;
		message_ids: string;
		updated_at: number;
	};
	personal_scopes: {
		id: GeneratedColumn<number>;
		chat_id: number;
		user_id: number;
		scope_chat_id: number | null;
	};
	stats: StatsRow;
};

type TableInfoRow = { name: string };

async function hasColumn(
	database: Database,
	table: "tournaments" | "duels" | "games" | "stats",
	columnName: string,
): Promise<boolean> {
	const result =
		await sql<TableInfoRow>`PRAGMA table_info(${sql.raw(table)})`.execute(
			database,
		);
	return result.rows.some((column) => column.name === columnName);
}

async function addColumnIfMissing(
	database: Database,
	table: "tournaments" | "duels" | "games" | "stats",
	columnName: string,
	definition: string,
): Promise<void> {
	if (await hasColumn(database, table, columnName)) return;
	await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN ${sql.raw(definition)}`.execute(
		database,
	);
}

async function migrate(database: Database): Promise<void> {
	await sql`PRAGMA foreign_keys = ON`.execute(database);
	await sql`PRAGMA journal_mode = WAL`.execute(database);

	await database.schema
		.createTable("chats")
		.ifNotExists()
		.addColumn("chat_id", "integer", (column) => column.primaryKey())
		.addColumn("settings", "text", (column) => column.notNull())
		.execute();
	await database.schema
		.createTable("games")
		.ifNotExists()
		.addColumn("id", "integer", (column) => column.primaryKey().autoIncrement())
		.addColumn("chat_id", "integer", (column) => column.notNull())
		.addColumn("answer", "text", (column) => column.notNull())
		.addColumn("language", "text", (column) => column.notNull().defaultTo("en"))
		.addColumn("status", "text", (column) =>
			column.notNull().defaultTo("active"),
		)
		.addColumn("kind", "text", (column) => column.notNull().defaultTo("normal"))
		.addColumn("guesses", "text", (column) => column.notNull().defaultTo("[]"))
		.addColumn("started_at", "integer", (column) => column.notNull())
		.addColumn("finished_at", "integer")
		.addColumn("tournament_id", "integer")
		.addColumn("duel_id", "integer")
		.addColumn("daily_date", "text")
		.execute();
	await database.schema
		.createIndex("idx_games_active")
		.ifNotExists()
		.on("games")
		.columns(["chat_id", "status"])
		.execute();
	await database.schema
		.createIndex("idx_games_daily")
		.ifNotExists()
		.on("games")
		.columns(["chat_id", "daily_date", "language", "kind", "status"])
		.execute();
	await database.schema
		.createTable("daily_words")
		.ifNotExists()
		.addColumn("date", "text", (column) => column.notNull())
		.addColumn("language", "text", (column) => column.notNull())
		.addColumn("word", "text", (column) => column.notNull())
		.addColumn("fetched_at", "integer", (column) => column.notNull())
		.addPrimaryKeyConstraint("daily_words_pk", ["date", "language"])
		.execute();
	await database.schema
		.createTable("used_words")
		.ifNotExists()
		.addColumn("id", "integer", (column) => column.primaryKey().autoIncrement())
		.addColumn("chat_id", "integer", (column) => column.notNull())
		.addColumn("word", "text", (column) => column.notNull())
		.addColumn("used_at", "integer", (column) => column.notNull())
		.execute();
	await database.schema
		.createIndex("idx_used_words")
		.ifNotExists()
		.on("used_words")
		.columns(["chat_id", "used_at"])
		.execute();
	await database.schema
		.createTable("tournaments")
		.ifNotExists()
		.addColumn("id", "integer", (column) => column.primaryKey().autoIncrement())
		.addColumn("chat_id", "integer", (column) => column.notNull())
		.addColumn("rounds", "integer", (column) => column.notNull())
		.addColumn("current_round", "integer", (column) =>
			column.notNull().defaultTo(1),
		)
		.addColumn("status", "text", (column) =>
			column.notNull().defaultTo("joining"),
		)
		.addColumn("players", "text", (column) => column.notNull().defaultTo("[]"))
		.addColumn("scores", "text", (column) => column.notNull().defaultTo("{}"))
		.addColumn("turn_idx", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("fail_count", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("turn_started_at", "integer")
		.addColumn("message_thread_id", "integer")
		.addColumn("created_by", "integer", (column) => column.notNull())
		.execute();
	await database.schema
		.createTable("duels")
		.ifNotExists()
		.addColumn("id", "integer", (column) => column.primaryKey().autoIncrement())
		.addColumn("chat_id", "integer", (column) => column.notNull())
		.addColumn("message_thread_id", "integer")
		.addColumn("answer", "text", (column) => column.notNull())
		.addColumn("status", "text", (column) =>
			column.notNull().defaultTo("pending"),
		)
		.addColumn("challenger", "text", (column) => column.notNull())
		.addColumn("opponent", "text")
		.execute();
	await database.schema
		.createTable("board_messages")
		.ifNotExists()
		.addColumn("chat_id", "integer", (column) => column.notNull())
		.addColumn("thread_id", "integer", (column) => column.notNull())
		.addColumn("message_ids", "text", (column) => column.notNull())
		.addColumn("updated_at", "integer", (column) => column.notNull())
		.addPrimaryKeyConstraint("board_messages_pk", ["chat_id", "thread_id"])
		.execute();
	await database.schema
		.createTable("personal_scopes")
		.ifNotExists()
		.addColumn("id", "integer", (column) => column.primaryKey().autoIncrement())
		.addColumn("chat_id", "integer", (column) => column.notNull())
		.addColumn("user_id", "integer", (column) => column.notNull())
		.addColumn("scope_chat_id", "integer", (column) => column.unique())
		.addUniqueConstraint("personal_scopes_chat_user_unique", [
			"chat_id",
			"user_id",
		])
		.execute();
	await database.schema
		.createTable("stats")
		.ifNotExists()
		.addColumn("chat_id", "integer", (column) => column.notNull())
		.addColumn("user_id", "integer", (column) => column.notNull())
		.addColumn("name", "text", (column) => column.notNull().defaultTo(""))
		.addColumn("games_played", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("games_won", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("solves", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("guesses_total", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("guess_quality_count", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("guess_expected_remaining_sum", "real", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("guess_quality_points_sum", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("greens", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("yellows", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("current_streak", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("best_streak", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("dist1", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("dist2", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("dist3", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("dist4", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("dist5", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("dist6", "integer", (column) => column.notNull().defaultTo(0))
		.addColumn("fastest_ms", "integer")
		.addColumn("tournaments_played", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("tournaments_won", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("tournament_points", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("duels_played", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addColumn("duels_won", "integer", (column) =>
			column.notNull().defaultTo(0),
		)
		.addPrimaryKeyConstraint("stats_pk", ["chat_id", "user_id"])
		.execute();

	await addColumnIfMissing(
		database,
		"tournaments",
		"fail_count",
		"fail_count INTEGER NOT NULL DEFAULT 0",
	);
	await addColumnIfMissing(
		database,
		"tournaments",
		"turn_started_at",
		"turn_started_at INTEGER",
	);
	await addColumnIfMissing(
		database,
		"tournaments",
		"message_thread_id",
		"message_thread_id INTEGER",
	);
	await addColumnIfMissing(
		database,
		"duels",
		"message_thread_id",
		"message_thread_id INTEGER",
	);
	await addColumnIfMissing(
		database,
		"games",
		"language",
		"language TEXT NOT NULL DEFAULT 'en'",
	);
	await addColumnIfMissing(database, "games", "daily_date", "daily_date TEXT");
	await addColumnIfMissing(
		database,
		"stats",
		"guess_quality_count",
		"guess_quality_count INTEGER NOT NULL DEFAULT 0",
	);
	await addColumnIfMissing(
		database,
		"stats",
		"guess_expected_remaining_sum",
		"guess_expected_remaining_sum REAL NOT NULL DEFAULT 0",
	);
	await addColumnIfMissing(
		database,
		"stats",
		"guess_quality_points_sum",
		"guess_quality_points_sum INTEGER NOT NULL DEFAULT 0",
	);
}

export function initDatabase(path: string): () => Promise<Database> {
	return async () => {
		const database = new Kysely<DatabaseSchema>({
			dialect: new DenoSqlite3Dialect({
				database: new SqliteDatabase(path, {
					int64: true,
					parseJson: false,
				}),
			}),
		});

		await migrate(database);
		return database;
	};
}

// ---------- chats / settings ----------

export async function getSettings(
	db: Database,
	chatId: number,
): Promise<ChatSettings> {
	const row = normalizeSqlRow(
		await db
			.selectFrom("chats")
			.select("settings")
			.where("chat_id", "=", chatId)
			.executeTakeFirst(),
	);
	if (!row) return structuredClone(DEFAULT_SETTINGS);
	const parsed = JSON.parse(row.settings);
	const rawCreativity = parsed.creativity ?? {};
	const creativity = {
		...structuredClone(DEFAULT_SETTINGS.creativity),
		...rawCreativity,
	};
	creativity.configured =
		rawCreativity.configured === true ||
		rawCreativity.mode !== undefined ||
		rawCreativity.seconds !== undefined ||
		rawCreativity.count !== undefined;
	// merge so settings added in later versions get defaults
	const oneshotDifficulty =
		parsed.oneshotDifficulty === "easy" ||
		parsed.oneshotDifficulty === "normal" ||
		parsed.oneshotDifficulty === "hard" ||
		parsed.oneshotDifficulty === "expert"
			? parsed.oneshotDifficulty
			: DEFAULT_SETTINGS.oneshotDifficulty;
	return {
		...structuredClone(DEFAULT_SETTINGS),
		...parsed,
		language: isWordLanguage(parsed.language)
			? parsed.language
			: DEFAULT_SETTINGS.language,
		wordLength: isSupportedWordLength(parsed.wordLength)
			? parsed.wordLength
			: DEFAULT_SETTINGS.wordLength,
		bareWord: parsed.bareWord === true,
		cleanup: parsed.cleanup === true,
		roast: parsed.roast === true,
		oneshotDifficulty,
		creativity,
		emojiPack: isEmojiPackConfig(parsed.emojiPack) ? parsed.emojiPack : null,
		tournamentMaxFails:
			parsed.tournamentMaxFails === null
				? null
				: Number.isInteger(parsed.tournamentMaxFails) &&
						parsed.tournamentMaxFails > 0
					? parsed.tournamentMaxFails
					: DEFAULT_SETTINGS.tournamentMaxFails,
		tournamentTurnSeconds:
			parsed.tournamentTurnSeconds === null
				? null
				: Number.isInteger(parsed.tournamentTurnSeconds) &&
						parsed.tournamentTurnSeconds > 0
					? parsed.tournamentTurnSeconds
					: DEFAULT_SETTINGS.tournamentTurnSeconds,
	};
}

export function saveSettings(
	db: Database,
	chatId: number,
	s: ChatSettings,
): Promise<void> {
	return db
		.insertInto("chats")
		.values({ chat_id: chatId, settings: JSON.stringify(s) })
		.onConflict((oc) =>
			oc.column("chat_id").doUpdateSet({ settings: JSON.stringify(s) }),
		)
		.execute()
		.then(() => {});
}

// ---------- personal game scopes ----------

export async function getPersonalScopeChatId(
	db: Database,
	chatId: number,
	userId: number,
): Promise<number | null> {
	const row = normalizeSqlRow(
		await db
			.selectFrom("personal_scopes")
			.select("scope_chat_id")
			.where("chat_id", "=", chatId)
			.where("user_id", "=", userId)
			.executeTakeFirst(),
	);
	return row?.scope_chat_id ?? null;
}

export async function getOrCreatePersonalScopeChatId(
	db: Database,
	chatId: number,
	userId: number,
): Promise<number> {
	const existing = await getPersonalScopeChatId(db, chatId, userId);
	if (existing !== null) return existing;

	await db
		.insertInto("personal_scopes")
		.values({ chat_id: chatId, user_id: userId, scope_chat_id: null })
		.onConflict((oc) => oc.columns(["chat_id", "user_id"]).doNothing())
		.execute();
	const row = normalizeSqlRow(
		await db
			.selectFrom("personal_scopes")
			.select(["id", "scope_chat_id"])
			.where("chat_id", "=", chatId)
			.where("user_id", "=", userId)
			.executeTakeFirstOrThrow(),
	);

	if (row.scope_chat_id !== null) return row.scope_chat_id;

	const scopeChatId = PERSONAL_SCOPE_BASE - row.id;
	await db
		.updateTable("personal_scopes")
		.set({ scope_chat_id: scopeChatId })
		.where("id", "=", row.id)
		.execute();
	return scopeChatId;
}

// ---------- board cleanup state ----------

function boardThreadKey(messageThreadId: number | null): number {
	return messageThreadId ?? 0;
}

export async function getBoardMessageIds(
	db: Database,
	chatId: number,
	messageThreadId: number | null,
): Promise<number[]> {
	const row = normalizeSqlRow(
		await db
			.selectFrom("board_messages")
			.select("message_ids")
			.where("chat_id", "=", chatId)
			.where("thread_id", "=", boardThreadKey(messageThreadId))
			.executeTakeFirst(),
	);
	if (!row) return [];

	const parsed = JSON.parse(row.message_ids);
	return Array.isArray(parsed)
		? parsed.filter((id): id is number => Number.isInteger(id) && id > 0)
		: [];
}

export function saveBoardMessageIds(
	db: Database,
	chatId: number,
	messageThreadId: number | null,
	messageIds: number[],
): Promise<void> {
	const values = {
		chat_id: chatId,
		thread_id: boardThreadKey(messageThreadId),
		message_ids: JSON.stringify(messageIds),
		updated_at: Date.now(),
	};
	return db
		.insertInto("board_messages")
		.values(values)
		.onConflict((oc) =>
			oc.columns(["chat_id", "thread_id"]).doUpdateSet({
				message_ids: values.message_ids,
				updated_at: values.updated_at,
			}),
		)
		.execute()
		.then(() => {});
}

// ---------- games ----------

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

// ---------- used words (creativity mode) ----------

export function recordUsedWord(
	db: Database,
	chatId: number,
	word: string,
): Promise<void> {
	return db
		.insertInto("used_words")
		.values({ chat_id: chatId, word: word.toLowerCase(), used_at: Date.now() })
		.execute()
		.then(() => {});
}

export async function recentWords(
	db: Database,
	chatId: number,
	c: CreativitySettings,
): Promise<Set<string>> {
	if (!c.enabled || !c.configured) return new Set();
	let rows: { word: string }[];
	if (c.mode === "time") {
		rows = normalizeSqlRows(
			await db
				.selectFrom("used_words")
				.select("word")
				.where("chat_id", "=", chatId)
				.where("used_at", ">=", Date.now() - c.seconds * 1000)
				.execute(),
		);
	} else {
		rows = normalizeSqlRows(
			await db
				.selectFrom("used_words")
				.select("word")
				.where("chat_id", "=", chatId)
				.orderBy("id", "desc")
				.limit(c.count)
				.execute(),
		);
	}
	return new Set(rows.map((r) => r.word));
}

// ---------- tournaments ----------

function parseTournament(row: TournamentSqlRow): TournamentRow {
	row = normalizeSqlRow(row);
	return {
		...row,
		players: JSON.parse(row.players),
		scores: JSON.parse(row.scores),
		fail_count: row.fail_count ?? 0,
		turn_started_at: row.turn_started_at ?? null,
		message_thread_id: row.message_thread_id ?? null,
	};
}

export async function getOpenTournament(
	db: Database,
	chatId: number,
): Promise<TournamentRow | null> {
	const row = await db
		.selectFrom("tournaments")
		.selectAll()
		.where("chat_id", "=", chatId)
		.where("status", "in", ["joining", "active"])
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();
	return row ? parseTournament(row) : null;
}

export async function getTournament(
	db: Database,
	id: number,
): Promise<TournamentRow | null> {
	const row = await db
		.selectFrom("tournaments")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
	return row ? parseTournament(row) : null;
}

export async function getActiveTournaments(
	db: Database,
): Promise<TournamentRow[]> {
	const rows = normalizeSqlRows(
		await db
			.selectFrom("tournaments")
			.selectAll()
			.where("status", "=", "active")
			.execute(),
	);
	return rows.map(parseTournament);
}

export async function createTournament(
	db: Database,
	chatId: number,
	rounds: number,
	createdBy: number,
	messageThreadId: number | null = null,
): Promise<TournamentRow> {
	const result = await db
		.insertInto("tournaments")
		.values({
			chat_id: chatId,
			rounds,
			created_by: createdBy,
			message_thread_id: messageThreadId,
			turn_started_at: null,
		})
		.executeTakeFirst();
	return (await getTournament(db, Number(result.insertId)))!;
}

export function updateTournament(
	db: Database,
	t: TournamentRow,
): Promise<void> {
	return db
		.updateTable("tournaments")
		.set({
			rounds: t.rounds,
			current_round: t.current_round,
			status: t.status,
			players: JSON.stringify(t.players),
			scores: JSON.stringify(t.scores),
			turn_idx: t.turn_idx,
			fail_count: t.fail_count,
			turn_started_at: t.turn_started_at,
			message_thread_id: t.message_thread_id,
		})
		.where("id", "=", t.id)
		.execute()
		.then(() => {});
}

// ---------- duels ----------

function parseDuel(row: DuelSqlRow): DuelRow {
	row = normalizeSqlRow(row);
	return {
		...row,
		challenger: JSON.parse(row.challenger),
		opponent: row.opponent ? JSON.parse(row.opponent) : null,
	};
}

export async function createDuel(
	db: Database,
	chatId: number,
	messageThreadId: number | null,
	answer: string,
	challenger: DuelPlayerResult,
): Promise<DuelRow> {
	const result = await db
		.insertInto("duels")
		.values({
			chat_id: chatId,
			message_thread_id: messageThreadId,
			answer,
			challenger: JSON.stringify(challenger),
			opponent: null,
		})
		.executeTakeFirst();
	return (await getDuel(db, Number(result.insertId)))!;
}

export async function getDuel(
	db: Database,
	id: number,
): Promise<DuelRow | null> {
	const row = await db
		.selectFrom("duels")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
	return row ? parseDuel(row) : null;
}

export function updateDuel(db: Database, d: DuelRow): Promise<void> {
	return db
		.updateTable("duels")
		.set({
			status: d.status,
			challenger: JSON.stringify(d.challenger),
			opponent: d.opponent ? JSON.stringify(d.opponent) : null,
		})
		.where("id", "=", d.id)
		.execute()
		.then(() => {});
}

// ---------- stats ----------

export async function getStats(
	db: Database,
	chatId: number,
	userId: number,
): Promise<StatsRow> {
	let row = normalizeSqlRow(
		await db
			.selectFrom("stats")
			.selectAll()
			.where("chat_id", "=", chatId)
			.where("user_id", "=", userId)
			.executeTakeFirst(),
	);
	if (!row) {
		await sql`INSERT INTO stats (chat_id, user_id)
			VALUES (${chatId}, ${userId})`.execute(db);
		row = normalizeSqlRow(
			await db
				.selectFrom("stats")
				.selectAll()
				.where("chat_id", "=", chatId)
				.where("user_id", "=", userId)
				.executeTakeFirstOrThrow(),
		);
	}
	return row;
}

export async function findStatsByName(
	db: Database,
	chatId: number,
	query: string,
): Promise<StatsRow | null> {
	const needle = query.trim().toLowerCase();
	if (!needle) return null;
	const row = normalizeSqlRow(
		(
			await sql<StatsRow>`SELECT *
				FROM stats
				WHERE chat_id = ${chatId}
					AND name <> ''
					AND instr(lower(name), ${needle}) > 0
				ORDER BY
					CASE
						WHEN lower(name) = ${needle} THEN 0
						WHEN substr(lower(name), 1, length(${needle})) = ${needle} THEN 1
						ELSE 2
					END,
					games_played DESC,
					user_id ASC
				LIMIT 1`.execute(db)
		).rows[0],
	);
	return row ?? null;
}

export async function getGlobalStats(
	db: Database,
	userId: number,
): Promise<StatsRow> {
	return normalizeSqlRow(
		(
			await sql<StatsRow>`SELECT
				0 AS chat_id,
				${userId} AS user_id,
				COALESCE(MAX(NULLIF(name, '')), '') AS name,
				COALESCE(SUM(games_played), 0) AS games_played,
				COALESCE(SUM(games_won), 0) AS games_won,
				COALESCE(SUM(solves), 0) AS solves,
				COALESCE(SUM(guesses_total), 0) AS guesses_total,
				COALESCE(SUM(guess_quality_count), 0) AS guess_quality_count,
				COALESCE(SUM(guess_expected_remaining_sum), 0) AS guess_expected_remaining_sum,
				COALESCE(SUM(guess_quality_points_sum), 0) AS guess_quality_points_sum,
				COALESCE(SUM(greens), 0) AS greens,
				COALESCE(SUM(yellows), 0) AS yellows,
				COALESCE(MAX(current_streak), 0) AS current_streak,
				COALESCE(MAX(best_streak), 0) AS best_streak,
				COALESCE(SUM(dist1), 0) AS dist1,
				COALESCE(SUM(dist2), 0) AS dist2,
				COALESCE(SUM(dist3), 0) AS dist3,
				COALESCE(SUM(dist4), 0) AS dist4,
				COALESCE(SUM(dist5), 0) AS dist5,
				COALESCE(SUM(dist6), 0) AS dist6,
				MIN(fastest_ms) AS fastest_ms,
				COALESCE(SUM(tournaments_played), 0) AS tournaments_played,
				COALESCE(SUM(tournaments_won), 0) AS tournaments_won,
				COALESCE(SUM(tournament_points), 0) AS tournament_points,
				COALESCE(SUM(duels_played), 0) AS duels_played,
				COALESCE(SUM(duels_won), 0) AS duels_won
				FROM stats
				WHERE user_id = ${userId}`.execute(db)
		).rows[0],
	);
}

export async function bumpStats(
	db: Database,
	chatId: number,
	userId: number,
	name: string,
	delta: Partial<
		Record<
			keyof Omit<
				StatsRow,
				"chat_id" | "user_id" | "name" | "fastest_ms" | "current_streak"
			>,
			number
		>
	>,
	extra: { setCurrentStreak?: number; fastestMs?: number } = {},
): Promise<void> {
	const row = await getStats(db, chatId, userId);
	const updates = [sql`name = ${name}`];
	for (const [k, v] of Object.entries(delta)) {
		if (!v) continue;
		updates.push(sql`${sql.ref(k)} = ${sql.ref(k)} + ${v}`);
	}
	if (extra.setCurrentStreak !== undefined) {
		updates.push(sql`current_streak = ${extra.setCurrentStreak}`);
		if (extra.setCurrentStreak > row.best_streak) {
			updates.push(sql`best_streak = ${extra.setCurrentStreak}`);
		}
	}
	if (
		extra.fastestMs !== undefined &&
		(row.fastest_ms === null || extra.fastestMs < row.fastest_ms)
	) {
		updates.push(sql`fastest_ms = ${extra.fastestMs}`);
	}
	await sql`UPDATE stats
		SET ${sql.join(updates)}
		WHERE chat_id = ${chatId} AND user_id = ${userId}`.execute(db);
}
