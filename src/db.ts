import Database from 'better-sqlite3';
import { DEFAULT_LANGUAGE, isWordLanguage, type WordLanguage } from './engine/language.js';
import { isEmojiPackConfig, type EmojiPackConfig } from './render/emoji-pack.js';

export interface CreativitySettings {
  enabled: boolean;
  configured: boolean;
  mode: 'time' | 'count';
  /** time window in seconds (mode === 'time') */
  seconds: number;
  /** last N words (mode === 'count') */
  count: number;
}

export type Difficulty = 'normal' | 'hard' | 'superhard';

export interface ChatSettings {
  language: WordLanguage;
  bareWord: boolean;
  cleanup: boolean;
  roast: boolean;
  difficulty: Difficulty;
  creativity: CreativitySettings;
  emojiPack: EmojiPackConfig | null;
  /** Tournament rejected guesses allowed per turn; null = unlimited. */
  tournamentMaxFails: number | null;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  language: DEFAULT_LANGUAGE,
  bareWord: false,
  cleanup: false,
  roast: false,
  difficulty: 'normal',
  creativity: { enabled: false, configured: false, mode: 'time', seconds: 3600, count: 20 },
  emojiPack: null,
  tournamentMaxFails: 5,
};

export interface GuessEntry {
  word: string;
  userId: number;
  userName: string;
  ts: number;
}

export type GameKind = 'normal' | 'tournament' | 'duel';
export type GameStatus = 'active' | 'solved' | 'lost';

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
}

export type TournamentStatus = 'joining' | 'active' | 'done' | 'cancelled';

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
  created_by: number;
}

export type DuelStatus = 'pending' | 'active' | 'done' | 'cancelled';

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

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      chat_id INTEGER PRIMARY KEY,
      settings TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      answer TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      status TEXT NOT NULL DEFAULT 'active',
      kind TEXT NOT NULL DEFAULT 'normal',
      guesses TEXT NOT NULL DEFAULT '[]',
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      tournament_id INTEGER,
      duel_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_games_active ON games(chat_id, status);
    CREATE TABLE IF NOT EXISTS used_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      used_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_used_words ON used_words(chat_id, used_at);
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      rounds INTEGER NOT NULL,
      current_round INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'joining',
      players TEXT NOT NULL DEFAULT '[]',
      scores TEXT NOT NULL DEFAULT '{}',
      turn_idx INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS duels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      message_thread_id INTEGER,
      answer TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      challenger TEXT NOT NULL,
      opponent TEXT
    );
    CREATE TABLE IF NOT EXISTS board_messages (
      chat_id INTEGER NOT NULL,
      thread_id INTEGER NOT NULL,
      message_ids TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (chat_id, thread_id)
    );
    CREATE TABLE IF NOT EXISTS stats (
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      games_played INTEGER NOT NULL DEFAULT 0,
      games_won INTEGER NOT NULL DEFAULT 0,
      solves INTEGER NOT NULL DEFAULT 0,
      guesses_total INTEGER NOT NULL DEFAULT 0,
      guess_quality_count INTEGER NOT NULL DEFAULT 0,
      guess_expected_remaining_sum REAL NOT NULL DEFAULT 0,
      guess_quality_points_sum INTEGER NOT NULL DEFAULT 0,
      greens INTEGER NOT NULL DEFAULT 0,
      yellows INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      dist1 INTEGER NOT NULL DEFAULT 0,
      dist2 INTEGER NOT NULL DEFAULT 0,
      dist3 INTEGER NOT NULL DEFAULT 0,
      dist4 INTEGER NOT NULL DEFAULT 0,
      dist5 INTEGER NOT NULL DEFAULT 0,
      dist6 INTEGER NOT NULL DEFAULT 0,
      fastest_ms INTEGER,
      tournaments_played INTEGER NOT NULL DEFAULT 0,
      tournaments_won INTEGER NOT NULL DEFAULT 0,
      tournament_points INTEGER NOT NULL DEFAULT 0,
      duels_played INTEGER NOT NULL DEFAULT 0,
      duels_won INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    );
  `);
  const tournamentColumns = db.prepare('PRAGMA table_info(tournaments)').all() as { name: string }[];
  if (!tournamentColumns.some((column) => column.name === 'fail_count')) {
    db.prepare('ALTER TABLE tournaments ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0').run();
  }
  const duelColumns = db.prepare('PRAGMA table_info(duels)').all() as { name: string }[];
  if (!duelColumns.some((column) => column.name === 'message_thread_id')) {
    db.prepare('ALTER TABLE duels ADD COLUMN message_thread_id INTEGER').run();
  }
  const gameColumns = db.prepare('PRAGMA table_info(games)').all() as { name: string }[];
  if (!gameColumns.some((column) => column.name === 'language')) {
    db.prepare("ALTER TABLE games ADD COLUMN language TEXT NOT NULL DEFAULT 'en'").run();
  }
  const statsColumns = db.prepare('PRAGMA table_info(stats)').all() as { name: string }[];
  if (!statsColumns.some((column) => column.name === 'guess_quality_count')) {
    db.prepare('ALTER TABLE stats ADD COLUMN guess_quality_count INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!statsColumns.some((column) => column.name === 'guess_expected_remaining_sum')) {
    db.prepare('ALTER TABLE stats ADD COLUMN guess_expected_remaining_sum REAL NOT NULL DEFAULT 0').run();
  }
  if (!statsColumns.some((column) => column.name === 'guess_quality_points_sum')) {
    db.prepare('ALTER TABLE stats ADD COLUMN guess_quality_points_sum INTEGER NOT NULL DEFAULT 0').run();
  }
  return db;
}

// ---------- chats / settings ----------

export function getSettings(db: Database.Database, chatId: number): ChatSettings {
  const row = db.prepare('SELECT settings FROM chats WHERE chat_id = ?').get(chatId) as
    | { settings: string }
    | undefined;
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
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...parsed,
    language: isWordLanguage(parsed.language) ? parsed.language : DEFAULT_SETTINGS.language,
    bareWord: parsed.bareWord === true,
    cleanup: parsed.cleanup === true,
    roast: parsed.roast === true,
    creativity,
    emojiPack: isEmojiPackConfig(parsed.emojiPack) ? parsed.emojiPack : null,
    tournamentMaxFails:
      parsed.tournamentMaxFails === null
        ? null
        : Number.isInteger(parsed.tournamentMaxFails) && parsed.tournamentMaxFails > 0
          ? parsed.tournamentMaxFails
          : DEFAULT_SETTINGS.tournamentMaxFails,
  };
}

export function saveSettings(db: Database.Database, chatId: number, s: ChatSettings): void {
  db.prepare(
    `INSERT INTO chats (chat_id, settings) VALUES (?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET settings = excluded.settings`
  ).run(chatId, JSON.stringify(s));
}

// ---------- board cleanup state ----------

function boardThreadKey(messageThreadId: number | null): number {
  return messageThreadId ?? 0;
}

export function getBoardMessageIds(db: Database.Database, chatId: number, messageThreadId: number | null): number[] {
  const row = db
    .prepare('SELECT message_ids FROM board_messages WHERE chat_id = ? AND thread_id = ?')
    .get(chatId, boardThreadKey(messageThreadId)) as { message_ids: string } | undefined;
  if (!row) return [];

  const parsed = JSON.parse(row.message_ids);
  return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
}

export function saveBoardMessageIds(
  db: Database.Database,
  chatId: number,
  messageThreadId: number | null,
  messageIds: number[]
): void {
  db.prepare(
    `INSERT INTO board_messages (chat_id, thread_id, message_ids, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id, thread_id) DO UPDATE SET
       message_ids = excluded.message_ids,
       updated_at = excluded.updated_at`
  ).run(chatId, boardThreadKey(messageThreadId), JSON.stringify(messageIds), Date.now());
}

// ---------- games ----------

function parseGame(row: any): GameRow {
  return {
    ...row,
    language: isWordLanguage(row.language) ? row.language : DEFAULT_LANGUAGE,
    guesses: JSON.parse(row.guesses),
  };
}

export function getActiveGame(db: Database.Database, chatId: number): GameRow | null {
  const row = db
    .prepare(`SELECT * FROM games WHERE chat_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`)
    .get(chatId);
  return row ? parseGame(row) : null;
}

export function getGame(db: Database.Database, id: number): GameRow | null {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  return row ? parseGame(row) : null;
}

export function createGame(
  db: Database.Database,
  chatId: number,
  answer: string,
  language: WordLanguage,
  kind: GameKind = 'normal',
  opts: { tournamentId?: number; duelId?: number } = {}
): GameRow {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO games (chat_id, answer, language, kind, started_at, tournament_id, duel_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(chatId, answer, language, kind, now, opts.tournamentId ?? null, opts.duelId ?? null);
  return getGame(db, Number(info.lastInsertRowid))!;
}

export function updateGame(db: Database.Database, game: GameRow): void {
  db.prepare(
    `UPDATE games SET status = ?, guesses = ?, finished_at = ? WHERE id = ?`
  ).run(game.status, JSON.stringify(game.guesses), game.finished_at, game.id);
}

// ---------- used words (creativity mode) ----------

export function recordUsedWord(db: Database.Database, chatId: number, word: string): void {
  db.prepare('INSERT INTO used_words (chat_id, word, used_at) VALUES (?, ?, ?)').run(
    chatId,
    word.toLowerCase(),
    Date.now()
  );
}

export function recentWords(db: Database.Database, chatId: number, c: CreativitySettings): Set<string> {
  if (!c.enabled || !c.configured) return new Set();
  let rows: { word: string }[];
  if (c.mode === 'time') {
    rows = db
      .prepare('SELECT word FROM used_words WHERE chat_id = ? AND used_at >= ?')
      .all(chatId, Date.now() - c.seconds * 1000) as { word: string }[];
  } else {
    rows = db
      .prepare('SELECT word FROM used_words WHERE chat_id = ? ORDER BY id DESC LIMIT ?')
      .all(chatId, c.count) as { word: string }[];
  }
  return new Set(rows.map((r) => r.word));
}

// ---------- tournaments ----------

function parseTournament(row: any): TournamentRow {
  return { ...row, players: JSON.parse(row.players), scores: JSON.parse(row.scores), fail_count: row.fail_count ?? 0 };
}

export function getOpenTournament(db: Database.Database, chatId: number): TournamentRow | null {
  const row = db
    .prepare(
      `SELECT * FROM tournaments WHERE chat_id = ? AND status IN ('joining','active') ORDER BY id DESC LIMIT 1`
    )
    .get(chatId);
  return row ? parseTournament(row) : null;
}

export function getTournament(db: Database.Database, id: number): TournamentRow | null {
  const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  return row ? parseTournament(row) : null;
}

export function createTournament(
  db: Database.Database,
  chatId: number,
  rounds: number,
  createdBy: number
): TournamentRow {
  const info = db
    .prepare('INSERT INTO tournaments (chat_id, rounds, created_by) VALUES (?, ?, ?)')
    .run(chatId, rounds, createdBy);
  return getTournament(db, Number(info.lastInsertRowid))!;
}

export function updateTournament(db: Database.Database, t: TournamentRow): void {
  db.prepare(
    `UPDATE tournaments SET rounds = ?, current_round = ?, status = ?, players = ?, scores = ?, turn_idx = ?, fail_count = ? WHERE id = ?`
  ).run(t.rounds, t.current_round, t.status, JSON.stringify(t.players), JSON.stringify(t.scores), t.turn_idx, t.fail_count, t.id);
}

// ---------- duels ----------

function parseDuel(row: any): DuelRow {
  return {
    ...row,
    challenger: JSON.parse(row.challenger),
    opponent: row.opponent ? JSON.parse(row.opponent) : null,
  };
}

export function createDuel(
  db: Database.Database,
  chatId: number,
  messageThreadId: number | null,
  answer: string,
  challenger: DuelPlayerResult
): DuelRow {
  const info = db
    .prepare('INSERT INTO duels (chat_id, message_thread_id, answer, challenger) VALUES (?, ?, ?, ?)')
    .run(chatId, messageThreadId, answer, JSON.stringify(challenger));
  return getDuel(db, Number(info.lastInsertRowid))!;
}

export function getDuel(db: Database.Database, id: number): DuelRow | null {
  const row = db.prepare('SELECT * FROM duels WHERE id = ?').get(id);
  return row ? parseDuel(row) : null;
}

export function updateDuel(db: Database.Database, d: DuelRow): void {
  db.prepare('UPDATE duels SET status = ?, challenger = ?, opponent = ? WHERE id = ?').run(
    d.status,
    JSON.stringify(d.challenger),
    d.opponent ? JSON.stringify(d.opponent) : null,
    d.id
  );
}

// ---------- stats ----------

export function getStats(db: Database.Database, chatId: number, userId: number): StatsRow {
  let row = db
    .prepare('SELECT * FROM stats WHERE chat_id = ? AND user_id = ?')
    .get(chatId, userId) as StatsRow | undefined;
  if (!row) {
    db.prepare('INSERT INTO stats (chat_id, user_id) VALUES (?, ?)').run(chatId, userId);
    row = db.prepare('SELECT * FROM stats WHERE chat_id = ? AND user_id = ?').get(chatId, userId) as StatsRow;
  }
  return row;
}

export function findStatsByName(db: Database.Database, chatId: number, query: string): StatsRow | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const row = db
    .prepare(
      `SELECT *
       FROM stats
       WHERE chat_id = ?
         AND name <> ''
         AND instr(lower(name), ?) > 0
       ORDER BY
         CASE
           WHEN lower(name) = ? THEN 0
           WHEN substr(lower(name), 1, length(?)) = ? THEN 1
           ELSE 2
         END,
         games_played DESC,
         user_id ASC
       LIMIT 1`
    )
    .get(chatId, needle, needle, needle, needle) as StatsRow | undefined;
  return row ?? null;
}

export function getGlobalStats(db: Database.Database, userId: number): StatsRow {
  return db
    .prepare(
      `SELECT
        0 AS chat_id,
        ? AS user_id,
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
       WHERE user_id = ?`
    )
    .get(userId, userId) as StatsRow;
}

export function bumpStats(
  db: Database.Database,
  chatId: number,
  userId: number,
  name: string,
  delta: Partial<Record<keyof Omit<StatsRow, 'chat_id' | 'user_id' | 'name' | 'fastest_ms' | 'current_streak'>, number>>,
  extra: { setCurrentStreak?: number; fastestMs?: number } = {}
): void {
  const row = getStats(db, chatId, userId);
  const updates: string[] = ['name = ?'];
  const values: unknown[] = [name];
  for (const [k, v] of Object.entries(delta)) {
    if (!v) continue;
    updates.push(`${k} = ${k} + ?`);
    values.push(v);
  }
  if (extra.setCurrentStreak !== undefined) {
    updates.push('current_streak = ?');
    values.push(extra.setCurrentStreak);
    if (extra.setCurrentStreak > row.best_streak) {
      updates.push('best_streak = ?');
      values.push(extra.setCurrentStreak);
    }
  }
  if (extra.fastestMs !== undefined && (row.fastest_ms === null || extra.fastestMs < row.fastest_ms)) {
    updates.push('fastest_ms = ?');
    values.push(extra.fastestMs);
  }
  values.push(chatId, userId);
  db.prepare(`UPDATE stats SET ${updates.join(', ')} WHERE chat_id = ? AND user_id = ?`).run(...values);
}
