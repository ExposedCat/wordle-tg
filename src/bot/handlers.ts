import { type Bot, InputFile } from "grammy";
import type { GameRow, TournamentRow } from "../app/data.ts";
import type { Context } from "../bot.ts";
import {
	renderBoardSticker,
	renderKeyboardSticker,
} from "../game/board-image.ts";
import { escapeHtml } from "../game/emoji-pack.ts";
import { MAX_GUESSES, maxGuessesForGame } from "../game/guess.ts";
import type { GuessQuality } from "../game/guess-quality.ts";
import {
	LANGUAGE_LABELS,
	MAX_WORD_LENGTH,
	MIN_WORD_LENGTH,
	type WordLanguage,
} from "../game/language.ts";
import { wordMeaning } from "../game/meaning.ts";
import type { TournamentRejectStatus, UserRef } from "../game/service.ts";
import {
	activeGame,
	activePersonalGame,
	activeTournaments,
	boardMessageIds,
	settings as chatSettings,
	expireTournamentTurn,
	getTournament,
	saveBoardMessageIds,
	setLanguage as saveLanguage,
	saveSettings,
	setWordLength as saveWordLength,
	submitGuess,
} from "../game.ts";
import { hasOpenAIKey, roastBadGuess } from "../llm.ts";
import { createLogger } from "../log.ts";
import {
	currentTournamentPlayer,
	playerMentionHtml,
	playerNameLinkHtml,
	tournamentRejectStatusHtml,
	tournamentStandingsHtml,
	tournamentStatusHtml,
	tournamentTimerExpiredHtml,
	tournamentTimerReminderHtml,
} from "../tournament/view.ts";
import {
	alreadyGuessedText,
	answerMeaningSentence,
	answerMeaningText,
	hardModeViolationText,
	helpText,
} from "./format.ts";
import { text as defaultText } from "./i18n.ts";
import {
	messageThreadId,
	storedThreadOptions,
	threadOptions,
	userRef,
} from "./telegram.ts";

export {
	lobbyKeyboard,
	lobbyText,
	type StyledInlineKeyboard,
	tournamentStandingsHtml,
	tournamentStatusHtml,
} from "../tournament/view.ts";
export {
	chatDisplayName,
	messageThreadId,
	telegramUserDisplayName,
	threadOptions,
	userAvatar,
	userRef,
} from "./telegram.ts";

const log = createLogger("bot");

type BotApi = Bot<Context>["api"];

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
	return game.status === "active" ? messageIds : [];
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

	const { game, guessNumber, solved, lost, tournament, quality } = guessResult;
	const maxGuesses = maxGuessesForGame(game);
	const lines: string[] = [];

	async function maybeRoastGuess(): Promise<void> {
		const logSkip = (reason: string) =>
			log.debug("Guess roast skipped", {
				reason,
				chatId: stateChatId,
				userId: user.id,
				word: word.toUpperCase(),
				quality,
			});

		try {
			const roastEnabled = (await chatSettings(chatId)).roast;
			const belowAverage = isBelowAverageQuality(quality);

			if (!belowAverage) return;
			if (!roastEnabled) {
				logSkip("roast_disabled");
				return;
			}
			if (!hasOpenAIKey()) {
				logSkip("missing_openai_key");
				return;
			}

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

	function queueRoastGuess(): void {
		void maybeRoastGuess();
	}

	const finishedMeaning =
		solved || lost ? await wordMeaning(game.answer, game.language) : undefined;
	const finishedMeaningHtml = finishedMeaning
		? escapeHtml(finishedMeaning)
		: undefined;

	if (lost) {
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
		queueRoastGuess();

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

	await sendBoard(context, chatId, game, lines.join("\n"), {
		headerHtml,
		captionHtml: lost,
		hideKeyboard: solved,
		stateChatId,
	});
	queueRoastGuess();
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
			? `\n${context.t("preferences.currentGameLanguage", {
					language: LANGUAGE_LABELS[active.language],
				})}`
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
			? `\n${context.t("preferences.currentGameLength", {
					length: active.answer.length,
				})}`
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
