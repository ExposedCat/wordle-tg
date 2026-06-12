import type {
	Database,
	DuelPlayerResult,
	DuelRow,
	DuelSqlRow,
} from "../app/schema.ts";
import { normalizeSqlRow } from "../app/sql.ts";

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
