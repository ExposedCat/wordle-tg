import { Bot } from "grammy";
import { run, sequentialize } from "grammy_runner";
import { registerHandlers } from "./bot/handlers.ts";
import { assertConfig, BOT_TOKEN, DB_PATH } from "./config.ts";
import { initDatabase } from "./db.ts";
import { createLogger } from "./log.ts";

const log = createLogger("main");

const COMMANDS = [
	{ command: "wordle", description: "Start a new game" },
	{ command: "personal", description: "Start your own game in this chat" },
	{ command: "daily", description: "Start today's daily word" },
	{ command: "w", description: "Guess the current word" },
	{ command: "length", description: "Set word length" },
	{ command: "auto", description: "Toggle bare-word guessing" },
	{ command: "cleanup", description: "Toggle old board cleanup" },
	{ command: "roast", description: "Toggle roasts for bad guesses" },
	{ command: "board", description: "Show the current board" },
	{ command: "stop", description: "End the game or open tournament" },
	{ command: "profile", description: "Your stats in this chat" },
	{ command: "compare", description: "Compare stats with another player" },
	{ command: "global", description: "Your stats across all chats" },
	{ command: "round", description: "Start a turn-based tournament" },
	{ command: "fails", description: "Set tournament rejected-guess limit" },
	{ command: "timer", description: "Set tournament turn timer" },
	{ command: "duel", description: "Duel a friend" },
	{ command: "usepack", description: "Use an existing custom emoji pack" },
	{
		command: "creativity",
		description: "Toggle or configure recent-word bans",
	},
	{ command: "normal", description: "Set normal mode" },
	{ command: "hard", description: "Set hard mode" },
	{ command: "superhard", description: "Set super hard mode" },
	{ command: "mode_help", description: "Mode details" },
	{ command: "creativity_help", description: "Creativity details" },
	{ command: "settings", description: "Chat settings" },
	{ command: "help", description: "How to play" },
];

async function main(): Promise<void> {
	assertConfig();
	log.debug("Configuration loaded", { dbPath: DB_PATH });

	const db = await initDatabase(DB_PATH)();
	log.debug("Database connected");
	const bot = new Bot(BOT_TOKEN);

	bot.use(
		sequentialize((ctx) => {
			const chatId = ctx.chat?.id.toString();
			return chatId === undefined ? [] : [chatId];
		}),
	);
	await registerHandlers(bot, db);
	log.debug("Handlers registered");

	bot.catch((err) => {
		log.error("Bot error", { error: err.error });
	});

	await bot.api.deleteWebhook({ drop_pending_updates: true });
	log.debug("Webhook deleted");
	await bot.api.setMyCommands(COMMANDS);
	log.debug("Bot commands registered", { commandCount: COMMANDS.length });
	const runner = run(bot);

	Deno.addSignalListener("SIGINT", () => {
		log.warn("SIGINT received, stopping runner");
		void runner.stop();
	});
	Deno.addSignalListener("SIGTERM", () => {
		log.warn("SIGTERM received, stopping runner");
		void runner.stop();
	});

	log.debug("telewordle is running with grammY runner. Press Ctrl+C to stop.");
	await runner.task();
}

main().catch((e) => {
	log.error("Fatal error", { error: e });
	Deno.exit(1);
});
