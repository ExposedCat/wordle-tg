import { Composer, InputFile } from "grammy";
import type { Context } from "../../bot.ts";
import { findStatsByName, globalStatsFor, statsFor } from "../../game/api.ts";
import { renderCompareSticker } from "../../render/image.ts";
import { statsText } from "../format.ts";
import {
	chatDisplayName,
	telegramUserDisplayName,
	threadOptions,
	userAvatar,
	userRef,
} from "../handlers.ts";

export const statsComposer = new Composer<Context>();

statsComposer.command("profile", async (context) => {
	const user = userRef(context);
	const statsRow = await statsFor(context.chat.id, user.id);
	await context.reply(
		statsText(context.t, statsRow, user.name, chatDisplayName(context)),
		{
			parse_mode: "HTML",
		},
	);
});

statsComposer.command("compare", async (context) => {
	const chatId = context.chat.id;
	const user = userRef(context);
	const searchName = (context.match ?? "").trim();
	const repliedUser = context.message?.reply_to_message?.from;

	let target: {
		userId: number;
		name: string;
		stats: Awaited<ReturnType<typeof statsFor>>;
	} | null = null;

	if (!searchName && repliedUser) {
		target = {
			userId: repliedUser.id,
			name: telegramUserDisplayName(repliedUser),
			stats: await statsFor(chatId, repliedUser.id),
		};
	} else if (searchName) {
		const foundStats = await findStatsByName(chatId, searchName);
		if (!foundStats) {
			return void (await context.text("stats.compareUnknown"));
		}
		target = {
			userId: foundStats.user_id,
			name: foundStats.name || `User ${foundStats.user_id}`,
			stats: foundStats,
		};
	}

	if (!target) {
		return void (await context.text("stats.compareUsage"));
	}
	if (target.userId === user.id) {
		return void (await context.text("stats.compareSelf"));
	}

	const [userPhoto, targetPhoto] = await Promise.all([
		userAvatar(context, user.id),
		userAvatar(context, target.userId),
	]);
	await context.api.sendSticker(
		chatId,
		new InputFile(
			await renderCompareSticker(
				{
					name: user.name,
					stats: await statsFor(chatId, user.id),
					avatar: userPhoto,
				},
				{ name: target.name, stats: target.stats, avatar: targetPhoto },
			),
			"compare.webp",
		),
		threadOptions(context),
	);
});

statsComposer.command("global", async (context) => {
	const user = userRef(context);
	const statsRow = await globalStatsFor(user.id);
	await context.reply(
		statsText(context.t, statsRow, user.name, context.t("stats.allChats")),
		{
			parse_mode: "HTML",
		},
	);
});
