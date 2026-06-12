import { Composer } from "grammy";
import type { Context } from "../../bot.ts";
import type { OneshotDifficulty } from "../../db.ts";
import { isGuessText } from "../../engine/language.ts";
import {
	acceptDuel,
	activeGame,
	giveUp,
	openTournament,
	setOneshotDifficulty,
	settings,
	startDailyGame,
	startGame,
	startOneshot,
	startPersonalGame,
} from "../../game/api.ts";
import { createLogger } from "../../log.ts";
import { escapeHtml } from "../../render/emoji-pack.ts";
import { giveUpText } from "../format.ts";
import {
	activePersonalTarget,
	expectedGuessLength,
	guessStateChatId,
	handleGuess,
	lobbyKeyboard,
	lobbyText,
	personalHeaderHtml,
	playGuessInstruction,
	replyHelp,
	sendBoard,
	tournamentStatusHtml,
	userRef,
	wordMeaning,
} from "../handlers.ts";

const ONESHOT_DIFFICULTIES: OneshotDifficulty[] = [
	"easy",
	"normal",
	"hard",
	"expert",
];
const log = createLogger("bot:game");

export const gameComposer = new Composer<Context>();

gameComposer.command("start", async (context) => {
	const payload = (context.match ?? "").trim();
	if (payload.startsWith("duel_")) {
		const duelId = parseInt(payload.slice(5), 10);
		if (context.chat.type !== "private" || !Number.isFinite(duelId)) return;
		const acceptResult = await acceptDuel(
			duelId,
			context.chat.id,
			userRef(context),
		);
		if (acceptResult === "not_found")
			return void (await context.text("game.duelGone"));
		if (acceptResult === "full")
			return void (await context.text("game.duelFull"));
		if (acceptResult === "already_playing")
			return void (await context.text("game.duelAlreadyPlaying"));
		if (acceptResult === "own_game_running")
			return void (await context.text("game.duelOwnGameRunning"));
		await context.text("game.duelAccepted", {
			length: acceptResult.game.answer.length,
		});
		await sendBoard(
			context,
			context.chat.id,
			acceptResult.game,
			context.t("game.duelBoard"),
		);
		return;
	}
	await replyHelp(context);
});

gameComposer.command("wordle", async (context) => {
	const chatId = context.chat.id;
	const openChatTournament = await openTournament(chatId);
	if (openChatTournament)
		return void (await context.text("game.tournamentOpen"));
	const game = await startGame(chatId);
	if (!game) return void (await context.text("game.gameAlreadyRunning"));
	const chatSettings = await settings(chatId);
	await sendBoard(
		context,
		chatId,
		game,
		`${playGuessInstruction(chatSettings.bareWord, game.answer.length)}`,
	);
});

gameComposer.command("personal", async (context) => {
	const chatId = context.chat.id;
	const user = userRef(context);
	const started = await startPersonalGame(chatId, user.id);
	if (!started) return void (await context.text("game.personalAlreadyRunning"));
	await sendBoard(
		context,
		chatId,
		started.game,
		context.t("game.personalLetters", { length: started.game.answer.length }),
		{
			headerHtml: personalHeaderHtml(user),
			stateChatId: started.chatId,
		},
	);
});

gameComposer.command("daily", async (context) => {
	const chatId = context.chat.id;
	const openChatTournament = await openTournament(chatId);
	if (openChatTournament)
		return void (await context.text("game.tournamentOpen"));
	let dailyStartResult: Awaited<ReturnType<typeof startDailyGame>>;
	try {
		dailyStartResult = await startDailyGame(chatId);
	} catch (error) {
		log.error("Failed to start daily wordle", { error, chatId });
		return void (await context.text("game.dailyFetchFailed"));
	}
	if (dailyStartResult.type === "active") {
		return void (await context.text("game.gameAlreadyRunning"));
	}
	if (dailyStartResult.type === "already_done") {
		return void (await context.text("game.dailyAlreadyDone", {
			word: escapeHtml(dailyStartResult.word.toUpperCase()),
		}));
	}
	const game = dailyStartResult.game;
	const chatSettings = await settings(chatId);
	await sendBoard(
		context,
		chatId,
		game,
		`${playGuessInstruction(chatSettings.bareWord, game.answer.length)}`,
	);
});

gameComposer.command("oneshot", async (context) => {
	const chatId = context.chat.id;
	const difficultyArgument = (context.match ?? "").trim().toLowerCase();

	if (difficultyArgument) {
		if (
			!ONESHOT_DIFFICULTIES.includes(difficultyArgument as OneshotDifficulty)
		) {
			return void (await context.text("game.oneshotUsage"));
		}
		const chatSettings = await setOneshotDifficulty(
			chatId,
			difficultyArgument as OneshotDifficulty,
		);
		return void (await context.text("game.oneshotDifficultySet", {
			difficulty: chatSettings.oneshotDifficulty,
		}));
	}

	const openChatTournament = await openTournament(chatId);
	if (openChatTournament)
		return void (await context.text("game.tournamentOpen"));
	if (await activeGame(chatId))
		return void (await context.text("game.gameAlreadyRunning"));

	const puzzle = await startOneshot(chatId);
	if (!puzzle) return void (await context.text("game.oneshotNoPuzzle"));

	await sendBoard(
		context,
		chatId,
		puzzle.game,
		context.t("game.oneshotCaption", {
			mode: puzzle.mode,
			length: puzzle.game.answer.length,
		}),
		{ captionHtml: true },
	);
});

gameComposer.command("w", async (context) => {
	const word = (context.match ?? "").trim();
	const length = await expectedGuessLength(context);
	if (!isGuessText(word, length)) {
		return void (await context.text("game.guessUsage", { length }));
	}
	await handleGuess(context, word);
});

gameComposer.command("board", async (context) => {
	const chatId = context.chat.id;
	const personal = await activePersonalTarget(context);
	const stateChatId = personal?.chatId ?? chatId;
	const game = personal?.game ?? (await activeGame(chatId));
	const openChatTournament = personal ? null : await openTournament(chatId);
	if (!game) {
		if (openChatTournament && openChatTournament.status === "joining")
			return void (await context.reply(lobbyText(openChatTournament), {
				parse_mode: "HTML",
				reply_markup: lobbyKeyboard(openChatTournament),
			}));
		return void (await context.text("game.noActiveBoard"));
	}
	if (openChatTournament && openChatTournament.status === "active") {
		await sendBoard(context, chatId, game, "", {
			footerHtml: tournamentStatusHtml(openChatTournament),
		});
		return;
	}
	await sendBoard(context, chatId, game, "", {
		headerHtml: personal ? personalHeaderHtml(userRef(context)) : undefined,
		stateChatId,
	});
});

gameComposer.command("stop", async (context) => {
	const personal = await activePersonalTarget(context);
	const giveUpResult = await giveUp(personal?.chatId ?? context.chat.id);
	if (!giveUpResult) return void (await context.text("game.noActiveStop"));
	const meaning =
		giveUpResult.answer && giveUpResult.language
			? await wordMeaning(giveUpResult.answer, giveUpResult.language)
			: undefined;
	const messageText = giveUpResult.answer
		? `${giveUpText(context.t, giveUpResult.answer, meaning ? escapeHtml(meaning) : undefined)}${giveUpResult.tournamentCancelled ? `\n\n${context.t("game.tournamentCancelled")}` : ""}`
		: giveUpResult.daily
			? context.t("game.dailyStopped")
			: context.t("game.tournamentCancelled");
	await context.reply(messageText, { parse_mode: "HTML" });
});

gameComposer.on("message:text", async (context) => {
	const text = context.message.text.trim();
	if (text.startsWith("/")) return;
	if (!isGuessText(text, await expectedGuessLength(context))) return;
	if (!(await settings(context.chat.id)).bareWord) return;
	await handleGuess(context, text, {
		silentNoGame: true,
		stateChatId: await guessStateChatId(context),
	});
});
