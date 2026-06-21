import {
	type ChatSettings,
	type Database,
	DEFAULT_SETTINGS,
} from "../app/schema.ts";
import { normalizeSqlRow } from "../app/sql.ts";
import { isEmojiPackConfig } from "../game/emoji-pack.ts";
import { isSupportedWordLength, isWordLanguage } from "../game/language.ts";

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
	const oneshotDifficulty =
		parsed.oneshotDifficulty === "easy" ||
		parsed.oneshotDifficulty === "normal" ||
		parsed.oneshotDifficulty === "hard" ||
		parsed.oneshotDifficulty === "expert"
			? parsed.oneshotDifficulty
			: DEFAULT_SETTINGS.oneshotDifficulty;
	const difficulty =
		parsed.difficulty === "normal" ||
		parsed.difficulty === "hard" ||
		parsed.difficulty === "superhard" ||
		parsed.difficulty === "megahard"
			? parsed.difficulty
			: DEFAULT_SETTINGS.difficulty;
	return {
		...structuredClone(DEFAULT_SETTINGS),
		...parsed,
		difficulty,
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
