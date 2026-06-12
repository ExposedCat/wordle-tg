import type { ColumnType, Kysely } from "@kysely/kysely";
import type { EmojiPackConfig } from "../game/emoji-pack.ts";
import {
	DEFAULT_LANGUAGE,
	DEFAULT_WORD_LENGTH,
	type WordLanguage,
} from "../game/language.ts";

type GeneratedColumn<T> = ColumnType<T, never, never>;
type DefaultColumn<T> = ColumnType<T, T | undefined, T>;

export type Database = Kysely<DatabaseSchema>;

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

export type GameKind = "normal" | "tournament" | "oneshot";
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
	daily_date: string | null;
}

export type GameSqlRow = Omit<GameRow, "guesses" | "language"> & {
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

export type TournamentSqlRow = Omit<TournamentRow, "players" | "scores"> & {
	players: string;
	scores: string;
};

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
