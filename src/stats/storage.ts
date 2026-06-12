import { sql } from "@kysely/kysely";
import type { Database, StatsRow } from "../app/schema.ts";
import { normalizeSqlRow } from "../app/sql.ts";

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
				COALESCE(SUM(tournament_points), 0) AS tournament_points
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
