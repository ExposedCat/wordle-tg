import { Database as SqliteDatabase } from "@db/sqlite";
import { Kysely, sql } from "@kysely/kysely";
import { DenoSqlite3Dialect } from "@marshift/kysely-deno-sqlite3";
import type { Database, DatabaseSchema } from "./schema.ts";

type TableInfoRow = { name: string };

async function hasColumn(
	database: Database,
	table: "tournaments" | "games" | "stats",
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
	table: "tournaments" | "games" | "stats",
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
