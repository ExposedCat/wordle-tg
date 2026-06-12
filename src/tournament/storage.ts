import type {
	Database,
	TournamentRow,
	TournamentSqlRow,
} from "../app/schema.ts";
import { normalizeSqlRow, normalizeSqlRows } from "../app/sql.ts";

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
