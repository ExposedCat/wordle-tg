import { type Bot, InputFile } from "grammy";
import type { Context } from "../bot.ts";
import { BOT_TOKEN } from "../config.ts";
import type { GameRow, TournamentRow } from "../db.ts";
import type { GuessQuality } from "../engine/guess-quality.ts";
import {
	LANGUAGE_LABELS,
	MAX_WORD_LENGTH,
	MIN_WORD_LENGTH,
	type WordLanguage,
} from "../engine/language.ts";
import {
	activeGame,
	activePersonalGame,
	activeTournaments,
	boardMessageIds,
	settings as chatSettings,
	duelWinner,
	expireTournamentTurn,
	getTournament,
	saveBoardMessageIds,
	setLanguage as saveLanguage,
	saveSettings,
	setWordLength as saveWordLength,
	submitGuess,
} from "../game/api.ts";
import {
	MAX_GUESSES,
	maxGuessesForGame,
	roundOrder,
	type TournamentRejectStatus,
	type UserRef,
} from "../game/service.ts";
import { describeWordMeaning, hasOpenAIKey, roastBadGuess } from "../llm.ts";
import { createLogger } from "../log.ts";
import { escapeHtml } from "../render/emoji-pack.ts";
import { renderBoardSticker, renderKeyboardSticker } from "../render/image.ts";
import {
	alreadyGuessedText,
	answerMeaningSentence,
	answerMeaningText,
	hardModeViolationText,
	helpText,
	humanMs,
	humanTurnTime,
	rankLabelHtml,
} from "./format.ts";
import { text as defaultText } from "./i18n.ts";

const log = createLogger("bot");

type BotApi = Bot<Context>["api"];

type StyledInlineButton = {
	text: string;
	callback_data: string;
	style: "success" | "primary" | "danger";
	icon_custom_emoji_id: string;
};

export type StyledInlineKeyboard = {
	inline_keyboard: StyledInlineButton[][];
};

export type StateMessageOptions = {
	headerHtml?: string;
	footer?: string;
	footerHtml?: string;
	captionHtml?: boolean;
	hideKeyboard?: boolean;
	stateChatId?: number;
};

export type ActivePersonalTarget = {
	chatId: number;
	game: GameRow;
} | null;

export function boardMessageIdsForCleanup(
	game: Pick<GameRow, "status">,
	messageIds: number[],
): number[] {
	return game.status === "solved" ? [] : messageIds;
}

export function userRef(context: Context): UserRef {
	const telegramUser = context.from!;
	const name =
		[telegramUser.first_name, telegramUser.last_name]
			.filter(Boolean)
			.join(" ") ||
		telegramUser.username ||
		context.t("partial.player");
	return {
		id: telegramUser.id,
		name,
		username: telegramUser.username,
		firstName: telegramUser.first_name || telegramUser.username || "Player",
	};
}

export function telegramUserDisplayName(user: {
	first_name: string;
	last_name?: string;
	username?: string;
}): string {
	return (
		[user.first_name, user.last_name].filter(Boolean).join(" ") ||
		user.username ||
		"Player"
	);
}

export function chatDisplayName(context: Context): string {
	const chat = context.chat;
	if (!chat) return context.t("partial.chat");
	if ("title" in chat && chat.title) return chat.title;
	if ("username" in chat && chat.username) return `@${chat.username}`;
	if ("first_name" in chat)
		return (
			[chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
			context.t("partial.privateChat")
		);
	return context.t("partial.chat");
}

function playerMentionHtml(player: {
	userId: number;
	userName: string;
	username?: string;
	firstName?: string;
}): string {
	if (player.username) return `@${player.username}`;
	const label = escapeHtml(player.firstName || player.userName);
	return `<a href="tg://user?id=${player.userId}">${label}</a>`;
}

function playerNameLinkHtml(player: {
	userId: number;
	userName: string;
	firstName?: string;
}): string {
	const label = escapeHtml(player.firstName || player.userName);
	return `<a href="tg://user?id=${player.userId}">${label}</a>`;
}

export function tournamentStandingsHtml(tournament: TournamentRow): string {
	return [...tournament.players]
		.map((player) => ({
			player,
			points: tournament.scores[String(player.userId)] ?? 0,
		}))
		.sort((left, right) => right.points - left.points)
		.map(
			(standing, index) =>
				`${rankLabelHtml(index + 1)} ${playerNameLinkHtml(standing.player)} · ${standing.points}`,
		)
		.join("\n");
}

function roundLabelHtml(tournament: TournamentRow): string {
	return defaultText("tournament.roundStatus", {
		round: tournament.current_round,
		rounds: tournament.rounds,
		standings: tournamentStandingsHtml(tournament),
	});
}

function currentTournamentPlayer(tournament: TournamentRow) {
	const turnOrder = roundOrder(tournament.players, tournament.current_round);
	return turnOrder[tournament.turn_idx % turnOrder.length];
}

export function tournamentStatusHtml(tournament: TournamentRow): string {
	return defaultText("tournament.status", {
		roundLabel: roundLabelHtml(tournament),
		player: playerMentionHtml(currentTournamentPlayer(tournament)),
	});
}

function tournamentRejectStatusHtml(status?: TournamentRejectStatus): string {
	if (!status) return "";
	const remaining = defaultText("tournament.rejectRemaining", {
		remaining: status.remaining,
		limit: status.limit,
	});
	if (!status.forfeit) return remaining;
	return defaultText("tournament.rejectForfeit", {
		remaining,
		player: playerNameLinkHtml(status.forfeitedPlayer),
		limit: status.limit,
		nextPlayer: playerMentionHtml(status.forfeit.nextPlayer),
	});
}

function tournamentTimerReminderHtml(
	player: TournamentRow["players"][number],
	secondsLeft: number,
): string {
	return defaultText("tournament.timerReminder", {
		player: playerNameLinkHtml(player),
		time: humanTurnTime(secondsLeft),
	});
}

function tournamentTimerExpiredHtml(
	expiredPlayer: TournamentRow["players"][number],
	nextPlayer: TournamentRow["players"][number],
): string {
	return defaultText("tournament.timerExpired", {
		player: playerNameLinkHtml(expiredPlayer),
		nextPlayer: playerMentionHtml(nextPlayer),
	});
}

export function messageThreadId(context: Context): number | undefined {
	const message = context.message ?? context.callbackQuery?.message;
	const threadId = (message as { message_thread_id?: unknown } | undefined)
		?.message_thread_id;
	return typeof threadId === "number" ? threadId : undefined;
}

export function threadOptions(context: Context): {
	message_thread_id?: number;
} {
	const threadId = messageThreadId(context);
	return threadId === undefined ? {} : { message_thread_id: threadId };
}

export async function userAvatar(
	context: Context,
	userId: number,
): Promise<Uint8Array | undefined> {
	try {
		const photos = await context.api.getUserProfilePhotos(userId, { limit: 1 });
		const photo = photos.photos[0]?.at(-1);
		if (!photo) return undefined;

		const file = await context.api.getFile(photo.file_id);
		if (!file.file_path) return undefined;

		const path = file.file_path.split("/").map(encodeURIComponent).join("/");
		const response = await fetch(
			`https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`,
		);
		if (!response.ok) return undefined;
		return new Uint8Array(await response.arrayBuffer());
	} catch {
		return undefined;
	}
}

function storedThreadOptions(threadId: number | null): {
	message_thread_id?: number;
} {
	return threadId === null ? {} : { message_thread_id: threadId };
}

export async function wordMeaning(
	word: string,
	language: WordLanguage,
): Promise<string | undefined> {
	try {
		return await describeWordMeaning(word, language);
	} catch (error) {
		log.error("Failed to generate word meaning", { error });
		return undefined;
	}
}

function isBelowAverageQuality(
	quality?: GuessQuality,
): quality is GuessQuality {
	return (
		quality !== undefined &&
		quality.possibleCount > 0 &&
		quality.actualRemaining > quality.averageRemaining
	);
}

export function lobbyText(tournament: TournamentRow): string {
	const names =
		tournament.players.length > 0
			? tournament.players.map(playerNameLinkHtml).join(", ")
			: defaultText("partial.noPlayers");
	const rounds = tournament.rounds > 0 ? ` · ${tournament.rounds}` : "";
	return defaultText("tournament.lobby", {
		players: names,
		rounds,
		maxGuesses: MAX_GUESSES,
	});
}

export function lobbyKeyboard(tournament: TournamentRow): StyledInlineKeyboard {
	return {
		inline_keyboard: [
			[
				{
					text: defaultText("tournament.buttonJoin"),
					callback_data: `t:join:${tournament.id}`,
					style: "success",
					icon_custom_emoji_id: "5920090136627908485",
				},
				{
					text: defaultText("tournament.buttonStart"),
					callback_data: `t:start:${tournament.id}`,
					style: "primary",
					icon_custom_emoji_id: "5994378304751145264",
				},
			],
			[
				{
					text: defaultText("tournament.buttonQuit"),
					callback_data: `t:quit:${tournament.id}`,
					style: "danger",
					icon_custom_emoji_id: "5922712343011135025",
				},
			],
		],
	};
}

const scheduledTimerEvents = new Set<string>();

async function sendStateMessage(
	context: Context,
	chatId: number,
	caption: string,
	boardText?: string,
	options: StateMessageOptions = {},
): Promise<number | null> {
	const textParts = [caption, boardText].filter((part): part is string =>
		Boolean(part),
	);
	const footerParts = [options.footer].filter((part): part is string =>
		Boolean(part),
	);
	const messageParts = [
		options.headerHtml,
		...textParts,
		...footerParts,
		options.footerHtml,
	].filter(Boolean);

	if (messageParts.length === 0) return null;

	if (options.headerHtml || options.footerHtml || options.captionHtml) {
		const escaped = textParts.map((part, index) =>
			index === 0 && options.captionHtml ? part : escapeHtml(part),
		);
		const escapedFooter = footerParts.map(escapeHtml);
		const message = await context.api.sendMessage(
			chatId,
			[options.headerHtml, ...escaped, ...escapedFooter, options.footerHtml]
				.filter(Boolean)
				.join("\n\n"),
			{
				...threadOptions(context),
				parse_mode: "HTML",
			},
		);
		return message.message_id;
	}

	const message = await context.api.sendMessage(
		chatId,
		[...textParts, ...footerParts].join("\n\n"),
		threadOptions(context),
	);
	return message.message_id;
}

function sendTournamentTimerMessage(
	botApi: BotApi,
	tournament: TournamentRow,
	html: string,
): Promise<unknown> {
	return botApi
		.sendMessage(tournament.chat_id, html, {
			...storedThreadOptions(tournament.message_thread_id),
			parse_mode: "HTML",
		})
		.catch((error) => {
			log.error("Failed to send tournament timer message", {
				error,
				tournamentId: tournament.id,
			});
		});
}

async function liveTimedTournament(
	tournamentId: number,
	turnStartedAt: number,
	timerSeconds: number,
): Promise<TournamentRow | null> {
	const tournament = await getTournament(tournamentId);
	if (
		!tournament ||
		tournament.status !== "active" ||
		tournament.turn_started_at !== turnStartedAt
	)
		return null;
	if (
		(await chatSettings(tournament.chat_id)).tournamentTurnSeconds !==
		timerSeconds
	)
		return null;
	return tournament;
}

export async function scheduleTournamentTimers(
	botApi: BotApi,
	tournament: TournamentRow,
): Promise<void> {
	const timerSeconds = (await chatSettings(tournament.chat_id))
		.tournamentTurnSeconds;
	if (
		timerSeconds === null ||
		tournament.status !== "active" ||
		tournament.turn_started_at === null
	)
		return;

	const totalMs = timerSeconds * 1000;
	const elapsedMs = Date.now() - tournament.turn_started_at;
	const events = [
		...(timerSeconds > 60
			? [{ label: "half", delayMs: Math.round(totalMs * 0.5) - elapsedMs }]
			: []),
		{ label: "ninety", delayMs: Math.round(totalMs * 0.9) - elapsedMs },
		{ label: "expire", delayMs: totalMs - elapsedMs },
	];

	for (const event of events) {
		if (event.label !== "expire" && event.delayMs <= 0) continue;
		const key = `${tournament.id}:${tournament.turn_started_at}:${timerSeconds}:${event.label}`;
		if (scheduledTimerEvents.has(key)) continue;
		scheduledTimerEvents.add(key);

		setTimeout(
			async () => {
				scheduledTimerEvents.delete(key);
				const live = await liveTimedTournament(
					tournament.id,
					tournament.turn_started_at!,
					timerSeconds,
				);
				if (!live) return;

				if (event.label === "expire") {
					const expired = await expireTournamentTurn(
						tournament.id,
						tournament.turn_started_at!,
					);
					if (!expired) return;
					const expiredTournament = expired.t;
					void sendTournamentTimerMessage(
						botApi,
						expiredTournament,
						tournamentTimerExpiredHtml(
							expired.expiredPlayer,
							expired.nextPlayer,
						),
					);
					await scheduleTournamentTimers(botApi, expiredTournament);
					return;
				}

				const secondsLeft = Math.max(
					1,
					Math.ceil((live.turn_started_at! + totalMs - Date.now()) / 1000),
				);
				void sendTournamentTimerMessage(
					botApi,
					live,
					tournamentTimerReminderHtml(
						currentTournamentPlayer(live),
						secondsLeft,
					),
				);
			},
			Math.max(0, event.delayMs),
		);
	}
}

function scheduleRejectedTurnForfeit(
	context: Context,
	status?: TournamentRejectStatus,
): void {
	if (status?.forfeit) {
		const forfeitTournament = status.forfeit.t;
		void scheduleTournamentTimers(context.api, forfeitTournament);
	}
}

async function deleteMessages(
	context: Context,
	chatId: number,
	messageIds: number[],
): Promise<void> {
	for (const messageId of messageIds) {
		await context.api.deleteMessage(chatId, messageId).catch(() => {});
	}
}

export async function sendBoard(
	context: Context,
	chatId: number,
	game: GameRow,
	caption: string,
	options: StateMessageOptions = {},
): Promise<void> {
	const stateChatId = options.stateChatId ?? chatId;
	const threadId = messageThreadId(context) ?? null;
	const currentSettings = await chatSettings(stateChatId);
	const previousMessageIds = currentSettings.cleanup
		? await boardMessageIds(stateChatId, threadId)
		: [];
	const sentMessageIds: number[] = [];

	await deleteMessages(context, chatId, previousMessageIds);

	const boardMessage = await context.api.sendSticker(
		chatId,
		new InputFile(renderBoardSticker(game), "board.webp"),
		threadOptions(context),
	);
	sentMessageIds.push(boardMessage.message_id);
	const hideKeyboard = options.hideKeyboard || game.status !== "active";
	if (!hideKeyboard) {
		const keyboardMessage = await context.api.sendSticker(
			chatId,
			new InputFile(renderKeyboardSticker(game), "keyboard.webp"),
			threadOptions(context),
		);
		sentMessageIds.push(keyboardMessage.message_id);
	}
	const stateMessageId = await sendStateMessage(
		context,
		chatId,
		caption,
		undefined,
		options,
	);
	if (stateMessageId !== null) sentMessageIds.push(stateMessageId);

	await saveBoardMessageIds(
		stateChatId,
		threadId,
		boardMessageIdsForCleanup(game, sentMessageIds),
	);
}

export async function activePersonalTarget(
	context: Context,
): Promise<ActivePersonalTarget> {
	if (!context.chat || !context.from) return null;
	return activePersonalGame(context.chat.id, context.from.id);
}

export async function guessStateChatId(context: Context): Promise<number> {
	return (await activePersonalTarget(context))?.chatId ?? context.chat!.id;
}

export function personalHeaderHtml(user: UserRef): string {
	return `<a href="tg://user?id=${user.id}">${escapeHtml(user.name)}</a>'s personal`;
}

export async function handleGuess(
	context: Context,
	word: string,
	options: { silentNoGame?: boolean; stateChatId?: number } = {},
): Promise<void> {
	const chatId = context.chat!.id;
	const stateChatId = options.stateChatId ?? (await guessStateChatId(context));
	const user = userRef(context);
	const personal = await activePersonalTarget(context);
	const headerHtml =
		personal?.chatId === stateChatId ? personalHeaderHtml(user) : undefined;
	const guessResult = await submitGuess(stateChatId, user, word);

	switch (guessResult.type) {
		case "no_game":
			if (!options.silentNoGame) await context.text("game.noGameGuess");
			return;
		case "not_a_word":
			await context.text("game.notAllowed", {
				word: escapeHtml(guessResult.word.toUpperCase()),
				rejectStatus: tournamentRejectStatusHtml(guessResult.rejectStatus),
			});
			scheduleRejectedTurnForfeit(context, guessResult.rejectStatus);
			return;
		case "already_guessed":
			{
				const game = (await activeGame(stateChatId))!;
				const currentSettings = await chatSettings(stateChatId);
				await context.reply(
					alreadyGuessedText(
						context.t,
						guessResult.word,
						game.answer,
						currentSettings.emojiPack,
					),
					{ parse_mode: "HTML" },
				);
			}
			return;
		case "creativity_blocked":
			await context.text("game.creativityBlocked", {
				word: escapeHtml(guessResult.word.toUpperCase()),
				rejectStatus: tournamentRejectStatusHtml(guessResult.rejectStatus),
			});
			scheduleRejectedTurnForfeit(context, guessResult.rejectStatus);
			return;
		case "hard_mode_violation":
			await context.reply(
				`${hardModeViolationText(context.t, guessResult.violation, guessResult.superHard, (await chatSettings(stateChatId)).emojiPack)}${tournamentRejectStatusHtml(guessResult.rejectStatus)}`,
				{
					parse_mode: "HTML",
				},
			);
			scheduleRejectedTurnForfeit(context, guessResult.rejectStatus);
			return;
		case "ignored":
			return;
		case "not_your_turn":
			await context.text("game.notYourTurn", {
				player: playerNameLinkHtml(guessResult.currentPlayer),
			});
			return;
	}

	const { game, guessNumber, solved, lost, tournament, duel, quality } =
		guessResult;
	const maxGuesses = maxGuessesForGame(game);
	const lines: string[] = [];

	async function maybeRoastGuess(): Promise<void> {
		const roastEnabled = (await chatSettings(chatId)).roast;
		const belowAverage = isBelowAverageQuality(quality);
		const logSkip = (reason: string) =>
			log.debug("Guess roast skipped", {
				reason,
				chatId: stateChatId,
				userId: user.id,
				word: word.toUpperCase(),
				quality,
			});

		if (!belowAverage) return;
		if (!roastEnabled) {
			logSkip("roast_disabled");
			return;
		}
		if (!hasOpenAIKey()) {
			logSkip("missing_openai_key");
			return;
		}

		try {
			const roast = await roastBadGuess({
				playerName: user.name,
				word,
				possibleCount: quality.possibleCount,
				actualRemaining: quality.actualRemaining,
				averageRemaining: quality.averageRemaining,
			});
			if (!roast) {
				logSkip("no_roast_text");
				return;
			}
			const messageId = context.message?.message_id;
			await context.reply(
				roast,
				messageId ? { reply_parameters: { message_id: messageId } } : undefined,
			);
		} catch (error) {
			log.error("Failed to generate guess roast", {
				error,
				chatId: stateChatId,
				userId: user.id,
				word: word.toUpperCase(),
				quality,
			});
		}
	}

	const finishedMeaning =
		solved || lost ? await wordMeaning(game.answer, game.language) : undefined;
	const finishedMeaningHtml = finishedMeaning
		? escapeHtml(finishedMeaning)
		: undefined;

	if (lost) {
		if (duel) lines.push(context.t("game.outOfGuessesSecret"));
		else
			lines.push(
				context.t("game.outOfGuessesAnswer", {
					answer: answerMeaningSentence(game.answer, finishedMeaningHtml),
				}),
			);
	}

	if (tournament) {
		const {
			t: activeTournament,
			pointsAwarded,
			roundEnded,
			tournamentEnded,
			nextGame,
			nextPlayer,
			winners,
		} = tournament;
		if (solved)
			lines.push(
				context.t("game.tournamentSolved", {
					player: user.name,
					guessNumber,
					maxGuesses: MAX_GUESSES,
					points: pointsAwarded,
					answer: answerMeaningText(game.answer, finishedMeaning),
				}),
			);
		const nextUpFooter =
			!roundEnded && nextPlayer
				? context.t("game.nextUp", {
						player: playerMentionHtml(nextPlayer),
					})
				: undefined;
		await sendBoard(context, chatId, game, lines.join("\n"), {
			footerHtml: nextUpFooter,
			captionHtml: lost,
			hideKeyboard: solved,
			stateChatId,
		});
		await maybeRoastGuess();

		if (tournamentEnded) {
			const winnerNames = winners.map(playerNameLinkHtml).join(" & ");
			await context.reply(
				context.t("game.tournamentFinished", {
					standings: tournamentStandingsHtml(activeTournament),
					winners: winnerNames,
					plural: winners.length > 1 ? "s" : "",
				}),
				{ parse_mode: "HTML" },
			);
		} else if (roundEnded && nextGame && nextPlayer) {
			await sendBoard(context, chatId, nextGame, "", {
				footerHtml: tournamentStatusHtml(activeTournament),
				stateChatId,
			});
			await scheduleTournamentTimers(context.api, activeTournament);
		} else {
			await scheduleTournamentTimers(context.api, activeTournament);
		}
		return;
	}

	if (solved) {
		lines.push(
			context.t("game.solved", {
				player: user.name,
				guessNumber,
				maxGuesses,
				answer: answerMeaningText(game.answer, finishedMeaning),
			}),
		);
	}

	if (duel) {
		await sendBoard(context, chatId, game, lines.join("\n"), {
			captionHtml: lost,
			hideKeyboard: solved,
			stateChatId,
		});
		const { d: duelRecord, finished, bothDone } = duel;
		if (finished && !bothDone) {
			await context.text("game.duelBoardDone");
		}
		if (bothDone) {
			const winner = duelWinner(duelRecord);
			const describeDuelPlayer = (duelPlayer: typeof duelRecord.challenger) =>
				duelPlayer.solved
					? context.t("game.duelResultSolved", {
							player: duelPlayer.userName,
							guesses: duelPlayer.guesses ?? MAX_GUESSES,
							maxGuesses: MAX_GUESSES,
							time: humanMs(duelPlayer.ms!),
						})
					: context.t("game.duelResultFailed", { player: duelPlayer.userName });
			const verdict =
				winner === "draw"
					? context.t("game.duelDraw")
					: context.t("game.duelWinner", {
							player: (winner as { userName: string }).userName,
						});
			const summary = context.t("game.duelFinished", {
				answer: answerMeaningSentence(duelRecord.answer, finishedMeaning),
				challenger: describeDuelPlayer(duelRecord.challenger),
				opponent: describeDuelPlayer(duelRecord.opponent!),
				verdict,
			});
			await context.reply(summary);
			await context.api
				.sendMessage(
					duelRecord.chat_id,
					summary,
					storedThreadOptions(duelRecord.message_thread_id),
				)
				.catch(() => {});
		}
		return;
	}

	await sendBoard(context, chatId, game, lines.join("\n"), {
		headerHtml,
		captionHtml: lost,
		hideKeyboard: solved,
		stateChatId,
	});
	await maybeRoastGuess();
}

export async function setDifficulty(
	context: Context,
	difficulty: "normal" | "hard" | "superhard",
): Promise<void> {
	const chatId = context.chat!.id;
	const currentSettings = await chatSettings(chatId);
	currentSettings.difficulty = difficulty;
	await saveSettings(chatId, currentSettings);
	const labels = {
		normal: context.t("partial.normal"),
		hard: context.t("partial.difficultyHardLabel"),
		superhard: context.t("partial.difficultySuperhardLabel"),
	};
	await context.text("preferences.difficultySet", {
		label: labels[difficulty],
	});
}

export async function expectedGuessLength(context: Context): Promise<number> {
	const stateChatId = await guessStateChatId(context);
	return (
		(await activeGame(stateChatId))?.answer.length ??
		(await chatSettings(context.chat!.id)).wordLength
	);
}

export function playGuessInstruction(
	bareWord: boolean,
	length: number,
): string {
	return defaultText(
		bareWord
			? "preferences.playInstructionBare"
			: "preferences.playInstructionCommand",
		{ length },
	);
}

export function autoGuessInstruction(
	bareWord: boolean,
	length: number,
): string {
	return defaultText(
		bareWord
			? "preferences.playInstructionBare"
			: "preferences.autoInstructionCommand",
		{ length },
	);
}

export async function setLanguage(
	context: Context,
	language: WordLanguage,
): Promise<void> {
	const chatId = context.chat!.id;
	await saveLanguage(chatId, language);
	const active = await activeGame(chatId);
	const suffix =
		active && active.language !== language
			? context.t("preferences.currentGameLanguage", {
					language: LANGUAGE_LABELS[active.language],
				})
			: "";
	await context.text("preferences.languageSelected", {
		language: LANGUAGE_LABELS[language],
		suffix,
	});
}

export async function setWordLength(context: Context): Promise<void> {
	const chatId = context.chat!.id;
	const value = String(context.match ?? "").trim();
	const length = parseInt(value, 10);
	if (!/^\d+$/.test(value) || !(await saveWordLength(chatId, length))) {
		return void (await context.text("preferences.lengthUsage", {
			min: MIN_WORD_LENGTH,
			max: MAX_WORD_LENGTH,
		}));
	}
	const active = await activeGame(chatId);
	const suffix =
		active && active.answer.length !== length
			? context.t("preferences.currentGameLength", {
					length: active.answer.length,
				})
			: "";
	await context.text("preferences.lengthSet", { length, suffix });
}

// ---------- commands ----------

export async function replyHelp(context: Context): Promise<void> {
	await context.reply(
		helpText(context.t, await chatSettings(context.chat!.id)),
		{
			parse_mode: "HTML",
			link_preview_options: { is_disabled: true },
		},
	);
}

export async function restoreActiveTournamentTimers(
	botApi: BotApi,
): Promise<void> {
	const tournaments = await activeTournaments();
	log.debug("Restoring active tournament timers", {
		count: tournaments.length,
	});
	for (const tournament of tournaments)
		void scheduleTournamentTimers(botApi, tournament);
}
