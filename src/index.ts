import { run } from "grammy_runner";
import { COMMANDS, initBot } from "./bot.ts";
import { assertConfig, BOT_TOKEN, DB_PATH } from "./config.ts";
import { initDatabase } from "./db.ts";
import { createLogger } from "./log.ts";

const log = createLogger("main");

async function main(): Promise<void> {
	assertConfig();
	log.debug("Configuration loaded", { dbPath: DB_PATH });

	const database = await initDatabase(DB_PATH)();
	log.debug("Database connected");
	const bot = await initBot(BOT_TOKEN, database);
	log.debug("Bot initialized");

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
