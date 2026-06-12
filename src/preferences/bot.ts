import { Composer } from "grammy";
import {
	creativityHelpText,
	humanDuration,
	modeHelpText,
	multiplayerHelpText,
	oneshotHelpText,
	parseCreativityValue,
	preferencesHelpText,
	statsHelpText,
} from "../bot/format.ts";
import {
	autoGuessInstruction,
	expectedGuessLength,
	replyHelp,
	setDifficulty,
	setLanguage,
	setWordLength,
} from "../bot/handlers.ts";
import { parseWordTarget } from "../bot/word-target.ts";
import type { Context } from "../bot.ts";
import {
	emojiPackFromStickers,
	packNameCandidates,
} from "../game/emoji-pack.ts";
import { saveSettings, settings } from "../game.ts";
import { roastBadGuess } from "../llm.ts";

export const preferenceComposer = new Composer<Context>();

preferenceComposer.command("help", (context) => replyHelp(context));

preferenceComposer.command("en", (context) => setLanguage(context, "en"));
preferenceComposer.command("ru", (context) => setLanguage(context, "ru"));
preferenceComposer.command("length", (context) => setWordLength(context));

preferenceComposer.command("auto", async (context) => {
	const chatSettings = await settings(context.chat.id);
	chatSettings.bareWord = !chatSettings.bareWord;
	await saveSettings(context.chat.id, chatSettings);
	await context.text("preferences.auto", {
		state: context.t(
			chatSettings.bareWord ? "partial.enabled" : "partial.disabled",
		),
		instruction: autoGuessInstruction(
			chatSettings.bareWord,
			await expectedGuessLength(context),
		),
	});
});

preferenceComposer.command("cleanup", async (context) => {
	const chatSettings = await settings(context.chat.id);
	chatSettings.cleanup = !chatSettings.cleanup;
	await saveSettings(context.chat.id, chatSettings);
	await context.text("preferences.cleanup", {
		state: context.t(
			chatSettings.cleanup ? "partial.enabled" : "partial.disabled",
		),
		not: chatSettings.cleanup ? "" : `${context.t("partial.not")} `,
	});
});

preferenceComposer.command("roast", async (context) => {
	const argument = (context.match ?? "").trim();
	const reply = context.message?.reply_to_message;
	const argumentTarget = argument ? parseWordTarget(argument) : null;
	const replyTarget = argument
		? null
		: parseWordTarget(reply?.text, { allowGuessCommand: true });
	const target = argumentTarget ?? replyTarget;

	if (argument || reply) {
		if (!target) return void (await context.text("game.roastUsage"));

		const roast = await roastBadGuess({
			playerName: context.from?.first_name ?? "Player",
			word: target.word,
			possibleCount: 0,
			actualRemaining: 0,
			averageRemaining: 0,
		});
		if (!roast) {
			return void (await context.text("game.roastUnavailable", {
				word: target.word.toUpperCase(),
			}));
		}

		await context.reply(
			roast,
			replyTarget && reply
				? { reply_parameters: { message_id: reply.message_id } }
				: undefined,
		);
		return;
	}

	const chatSettings = await settings(context.chat.id);
	chatSettings.roast = !chatSettings.roast;
	await saveSettings(context.chat.id, chatSettings);
	await context.text("preferences.roast", {
		state: context.t(
			chatSettings.roast ? "partial.enabled" : "partial.disabled",
		),
		not: chatSettings.roast ? "" : `${context.t("partial.not")} `,
	});
});

preferenceComposer.command("usepack", async (context) => {
	const requestedName = (context.match ?? "").trim();
	if (!requestedName) {
		return void (await context.text("preferences.usepackUsage"));
	}

	let lastError: unknown = null;
	for (const packName of packNameCandidates(
		requestedName,
		context.me.username,
	)) {
		try {
			const stickerSet = await context.api.getStickerSet(packName);
			if (stickerSet.sticker_type !== "custom_emoji") {
				return void (await context.text("preferences.packNotCustomEmoji", {
					packName,
				}));
			}

			const chatSettings = await settings(context.chat.id);
			chatSettings.emojiPack = emojiPackFromStickers(
				packName,
				stickerSet.stickers,
			);
			await saveSettings(context.chat.id, chatSettings);
			await context.text("preferences.packEnabled", { packName });
			return;
		} catch (error) {
			lastError = error;
		}
	}

	const message =
		lastError instanceof Error ? lastError.message : String(lastError);
	await context.text("preferences.packFailed", { message });
});

preferenceComposer.command("creativity", async (context) => {
	const chatId = context.chat.id;
	const creativityArgument = (context.match ?? "").trim();
	const chatSettings = await settings(chatId);

	if (!creativityArgument) {
		if (chatSettings.creativity.enabled) {
			chatSettings.creativity.enabled = false;
			await saveSettings(chatId, chatSettings);
			return void (await context.text("preferences.creativityDisabled"));
		}

		if (!chatSettings.creativity.configured) {
			return void (await context.text("preferences.creativityNeedsFrame"));
		}

		chatSettings.creativity.enabled = true;
		await saveSettings(chatId, chatSettings);
		return void (await context.text("preferences.creativityEnabled", {
			frame:
				chatSettings.creativity.mode === "time"
					? `<b>${humanDuration(chatSettings.creativity.seconds)}</b>`
					: `<b>${chatSettings.creativity.count} ${context.t("partial.words")}</b>`,
		}));
	}

	const creativityValue = parseCreativityValue(creativityArgument);
	if (!creativityValue) {
		return void (await context.text("preferences.creativityUsage"));
	}

	chatSettings.creativity.enabled = true;
	chatSettings.creativity.configured = true;
	if ("seconds" in creativityValue) {
		chatSettings.creativity.mode = "time";
		chatSettings.creativity.seconds = creativityValue.seconds;
	} else {
		chatSettings.creativity.mode = "count";
		chatSettings.creativity.count = creativityValue.count;
	}
	await saveSettings(chatId, chatSettings);

	await context.text("preferences.creativityEnabled", {
		frame:
			chatSettings.creativity.mode === "time"
				? `<b>${humanDuration(chatSettings.creativity.seconds)}</b>`
				: `<b>${chatSettings.creativity.count} ${context.t("partial.words")}</b>`,
	});
});

preferenceComposer.command("normal", async (context) =>
	setDifficulty(context, "normal"),
);
preferenceComposer.command("hard", async (context) =>
	setDifficulty(context, "hard"),
);
preferenceComposer.command("superhard", async (context) =>
	setDifficulty(context, "superhard"),
);

preferenceComposer.command("wordle_help", async (context) =>
	context.text("help.wordle"),
);
preferenceComposer.command("oneshot_help", async (context) =>
	context.reply(oneshotHelpText(context.t, await settings(context.chat.id)), {
		parse_mode: "HTML",
	}),
);
preferenceComposer.command("mode_help", async (context) =>
	context.reply(modeHelpText(context.t, await settings(context.chat.id)), {
		parse_mode: "HTML",
	}),
);
preferenceComposer.command("creativity_help", async (context) =>
	context.reply(
		creativityHelpText(context.t, await settings(context.chat.id)),
		{
			parse_mode: "HTML",
		},
	),
);
preferenceComposer.command("multiplayer_help", async (context) =>
	context.reply(
		multiplayerHelpText(context.t, await settings(context.chat.id)),
		{
			parse_mode: "HTML",
		},
	),
);
preferenceComposer.command("stats_help", async (context) =>
	context.reply(statsHelpText(context.t), { parse_mode: "HTML" }),
);
preferenceComposer.command("preferences_help", async (context) =>
	context.reply(
		preferencesHelpText(context.t, await settings(context.chat.id)),
		{
			parse_mode: "HTML",
		},
	),
);
