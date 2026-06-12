import type { I18nFlavor, TranslationVariables } from "@grammyjs/i18n";
import { Bot, type Context as GrammyContext } from "grammy";
import { sequentialize } from "grammy_runner";
import type { Database } from "./app/data.ts";
import { restoreActiveTournamentTimers } from "./bot/handlers.ts";
import { text as defaultText, i18n } from "./bot/i18n.ts";
import { gameComposer } from "./game/bot.ts";
import { initGame } from "./game.ts";
import { createLogger } from "./log.ts";
import { preferenceComposer } from "./preferences/bot.ts";
import { statsComposer } from "./stats/bot.ts";
import { tournamentComposer } from "./tournament/bot.ts";

type TextReply = (
	key: string,
	templateData?: TranslationVariables,
	extra?: Parameters<GrammyContext["reply"]>[1],
) => ReturnType<GrammyContext["reply"]>;

export type Context = GrammyContext &
	I18nFlavor & {
		text: TextReply;
	};

export const COMMANDS = [
	{ command: "wordle", description: defaultText("command.wordle") },
	{ command: "personal", description: defaultText("command.personal") },
	{ command: "daily", description: defaultText("command.daily") },
	{ command: "w", description: defaultText("command.w") },
	{ command: "length", description: defaultText("command.length") },
	{ command: "auto", description: defaultText("command.auto") },
	{ command: "cleanup", description: defaultText("command.cleanup") },
	{ command: "roast", description: defaultText("command.roast") },
	{ command: "board", description: defaultText("command.board") },
	{ command: "stop", description: defaultText("command.stop") },
	{ command: "profile", description: defaultText("command.profile") },
	{ command: "compare", description: defaultText("command.compare") },
	{ command: "global", description: defaultText("command.global") },
	{ command: "round", description: defaultText("command.round") },
	{ command: "fails", description: defaultText("command.fails") },
	{ command: "timer", description: defaultText("command.timer") },
	{ command: "duel", description: defaultText("command.duel") },
	{ command: "usepack", description: defaultText("command.usepack") },
	{
		command: "creativity",
		description: defaultText("command.creativity"),
	},
	{ command: "normal", description: defaultText("command.normal") },
	{ command: "hard", description: defaultText("command.hard") },
	{ command: "superhard", description: defaultText("command.superhard") },
	{ command: "mode_help", description: defaultText("command.mode_help") },
	{
		command: "creativity_help",
		description: defaultText("command.creativity_help"),
	},
	{ command: "settings", description: defaultText("command.settings") },
	{ command: "help", description: defaultText("command.help") },
];

export async function initBot(
	token: string,
	database: Database,
): Promise<Bot<Context>> {
	const logger = createLogger("bot");
	const bot = new Bot<Context>(token);
	initGame(database);

	bot.use(
		sequentialize((context) => {
			const chatId = context.chat?.id.toString();
			return chatId === undefined ? [] : [chatId];
		}),
	);

	bot.use((context, next) => {
		context.text = (key, templateData, extra = {}) =>
			context.reply(context.t(key, templateData), {
				parse_mode: "HTML",
				link_preview_options: { is_disabled: true },
				...extra,
			});
		return next();
	});

	bot.use(i18n.middleware());

	bot.use(preferenceComposer);
	bot.use(statsComposer);
	bot.use(tournamentComposer);
	bot.use(gameComposer);

	await restoreActiveTournamentTimers(bot.api);

	bot.catch((botError) => {
		logger.error("Bot error", { error: botError.error });
	});

	return bot;
}
