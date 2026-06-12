import type { Database } from "../app/schema.ts";
import { normalizeSqlRow } from "../app/sql.ts";

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
