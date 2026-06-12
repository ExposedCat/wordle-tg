import type { Database } from "../app/schema.ts";
import { normalizeSqlRow } from "../app/sql.ts";

const PERSONAL_SCOPE_BASE = -1_000_000_000_000_000;

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
