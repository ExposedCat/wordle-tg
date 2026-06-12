import type { CreativitySettings, Database } from "../app/schema.ts";
import { normalizeSqlRows } from "../app/sql.ts";

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
