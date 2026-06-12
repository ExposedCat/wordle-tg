import { Composer } from "grammy";
import { humanTurnTime, parseTournamentTimerValue } from "../bot/format.ts";
import {
	messageThreadId,
	scheduleTournamentTimers,
	sendBoard,
	userRef,
} from "../bot/handlers.ts";
import type { Context } from "../bot.ts";
import {
	activeGame,
	createTournament,
	joinTournament,
	openTournament,
	quitTournament,
	resetActiveTournamentTurnTimer,
	saveSettings,
	settings,
	startTournament,
} from "../game.ts";
import {
	lobbyKeyboard,
	lobbyText,
	tournamentStandingsHtml,
	tournamentStatusHtml,
} from "./view.ts";

export const tournamentComposer = new Composer<Context>();

tournamentComposer.command("fails", async (context) => {
	const chatId = context.chat.id;
	const value = (context.match ?? "").trim().toLowerCase();
	if (!value) {
		return void (await context.text("tournament.failsUsage"));
	}

	const chatSettings = await settings(chatId);
	if (value === "off" || value === "unlimited") {
		chatSettings.tournamentMaxFails = null;
	} else {
		const maxFails = parseInt(value, 10);
		if (!/^\d+$/.test(value) || maxFails <= 0) {
			return void (await context.text("tournament.failsValueUsage"));
		}
		chatSettings.tournamentMaxFails = maxFails;
	}
	await saveSettings(chatId, chatSettings);
	const label =
		chatSettings.tournamentMaxFails === null
			? context.t("tournament.unlimitedOff")
			: `${chatSettings.tournamentMaxFails}`;
	await context.text("tournament.failsSet", { value: label });
});

tournamentComposer.command("timer", async (context) => {
	const chatId = context.chat.id;
	const value = (context.match ?? "").trim();
	const chatSettings = await settings(chatId);

	if (!value) {
		chatSettings.tournamentTurnSeconds = null;
		await saveSettings(chatId, chatSettings);
		return void (await context.text("tournament.timerDisabled"));
	}

	const seconds = parseTournamentTimerValue(value);
	if (seconds === null) {
		return void (await context.text("tournament.timerUsage"));
	}

	chatSettings.tournamentTurnSeconds = seconds;
	await saveSettings(chatId, chatSettings);
	const activeTournament = await resetActiveTournamentTurnTimer(chatId);
	if (activeTournament)
		await scheduleTournamentTimers(context.api, activeTournament);
	await context.text("tournament.timerSet", { time: humanTurnTime(seconds) });
});

tournamentComposer.command("round", async (context) => {
	const chatId = context.chat.id;
	const roundsArgument = (context.match ?? "").trim().toLowerCase();
	if (roundsArgument && !/^\d+$/.test(roundsArgument))
		return void (await context.text("tournament.roundUsage"));
	const existing = await openTournament(chatId);
	if (existing) {
		if (existing.status === "joining")
			return void (await context.reply(lobbyText(existing), {
				parse_mode: "HTML",
				reply_markup: lobbyKeyboard(existing),
			}));
		return void (await context.reply(tournamentStandingsHtml(existing), {
			parse_mode: "HTML",
		}));
	}
	const parsedRounds = parseInt(roundsArgument, 10);
	const rounds =
		Number.isFinite(parsedRounds) && parsedRounds >= 1 && parsedRounds <= 25
			? parsedRounds
			: 0;
	if (await activeGame(chatId))
		return void (await context.text("tournament.finishGameFirst"));
	const tournament = await createTournament(
		chatId,
		rounds,
		userRef(context),
		messageThreadId(context) ?? null,
	);
	if (!tournament) return void (await context.text("tournament.createFailed"));
	await context.reply(lobbyText(tournament), {
		parse_mode: "HTML",
		reply_markup: lobbyKeyboard(tournament),
	});
});

tournamentComposer.callbackQuery(/^t:join:(\d+)$/, async (context) => {
	const joinResult = await joinTournament(
		parseInt(context.match[1], 10),
		userRef(context),
	);
	if (!joinResult || joinResult === "closed")
		return void (await context.answerCallbackQuery(
			context.t("tournament.joinClosed"),
		));
	if (joinResult === "already_in")
		return void (await context.answerCallbackQuery(
			context.t("tournament.alreadyIn"),
		));
	await context.editMessageText(lobbyText(joinResult), {
		parse_mode: "HTML",
		reply_markup: lobbyKeyboard(joinResult),
	});
	await context.answerCallbackQuery(context.t("tournament.joined"));
});

tournamentComposer.callbackQuery(/^t:quit:(\d+)$/, async (context) => {
	const quitResult = await quitTournament(
		parseInt(context.match[1], 10),
		context.from.id,
	);
	if (!quitResult || quitResult === "closed")
		return void (await context.answerCallbackQuery(
			context.t("tournament.joinClosed"),
		));
	if (quitResult === "not_in")
		return void (await context.answerCallbackQuery(
			context.t("tournament.notIn"),
		));
	if (quitResult.status === "cancelled") {
		await context.editMessageText(context.t("game.tournamentCancelled"), {
			parse_mode: "HTML",
			reply_markup: { inline_keyboard: [] },
		});
		return void (await context.answerCallbackQuery(
			context.t("tournament.quitCancelled"),
		));
	}
	await context.editMessageText(lobbyText(quitResult), {
		parse_mode: "HTML",
		reply_markup: lobbyKeyboard(quitResult),
	});
	await context.answerCallbackQuery(context.t("tournament.quit"));
});

tournamentComposer.callbackQuery(/^t:start:(\d+)$/, async (context) => {
	const tournamentId = parseInt(context.match[1], 10);
	const tournament = await openTournament(context.chat!.id);
	if (!tournament || tournament.id !== tournamentId)
		return void (await context.answerCallbackQuery(
			context.t("tournament.startClosed"),
		));
	if (tournament.created_by !== context.from.id)
		return void (await context.answerCallbackQuery(
			context.t("tournament.onlyCreator"),
		));
	const startResult = await startTournament(tournamentId);
	if (startResult === "too_few")
		return void (await context.answerCallbackQuery(
			context.t("tournament.tooFew"),
		));
	if (!startResult)
		return void (await context.answerCallbackQuery(
			context.t("tournament.startFailed"),
		));
	await context.answerCallbackQuery(context.t("tournament.gameOn"));
	const startedTournament = startResult.t;
	await context.editMessageText(lobbyText(startedTournament), {
		parse_mode: "HTML",
		reply_markup: { inline_keyboard: [] },
	});
	await sendBoard(context, context.chat!.id, startResult.game, "", {
		footerHtml: tournamentStatusHtml(startedTournament),
	});
	await scheduleTournamentTimers(context.api, startedTournament);
});
