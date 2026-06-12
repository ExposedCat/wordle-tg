import { type Bot, type Context, InlineKeyboard, InputFile } from "grammy";
import { BOT_TOKEN } from "../config.ts";
import type {
	Database,
	GameRow,
	OneshotDifficulty,
	TournamentRow,
} from "../db.ts";
import type { GuessQuality } from "../engine/guess-quality.ts";
import {
	isGuessText,
	LANGUAGE_LABELS,
	MAX_WORD_LENGTH,
	MIN_WORD_LENGTH,
	type WordLanguage,
} from "../engine/language.ts";
import {
	GameService,
	MAX_GUESSES,
	maxGuessesForGame,
	roundOrder,
	type TournamentRejectStatus,
	type UserRef,
} from "../game/service.ts";
import { describeWordMeaning, hasOpenAIKey, roastBadGuess } from "../llm.ts";
import {
	emojiPackFromStickers,
	escapeHtml,
	packNameCandidates,
} from "../render/emoji-pack.ts";
import {
	renderBoardSticker,
	renderCompareSticker,
	renderKeyboardSticker,
} from "../render/image.ts";
import {
	alreadyGuessedText,
	answerMeaningSentence,
	answerMeaningText,
	creativityHelpText,
	giveUpText,
	hardModeViolationText,
	helpText,
	humanDuration,
	humanMs,
	humanTurnTime,
	modeHelpText,
	multiplayerHelpText,
	oneshotHelpText,
	parseCreativityValue,
	parseTournamentTimerValue,
	preferencesHelpText,
	rankLabelHtml,
	statsHelpText,
	statsText,
	wordleHelpText,
} from "./format.ts";

const PEOPLE_EMOJI = '<tg-emoji emoji-id="5942877472163892475">👥</tg-emoji>';
const JOIN_EMOJI_ID = "5920090136627908485";
const QUIT_EMOJI_ID = "5922712343011135025";
const START_EMOJI_ID = "5994378304751145264";
const NOT_SO_FAST = '<tg-emoji emoji-id="5776213190387961618">⏳</tg-emoji>';
const OUT_OF_GUESSES = '<tg-emoji emoji-id="5897962422169243693">💀</tg-emoji>';
const CROWN = '<tg-emoji emoji-id="5807868868886009920">👑</tg-emoji>';
const TOURNAMENT_FINISHED =
	'<tg-emoji emoji-id="5942913498349571809">🏆</tg-emoji>';
const NOT_ALLOWED = '<tg-emoji emoji-id="5924719252379537729">🤔</tg-emoji>';
const TOURNAMENT_CANCELLED =
	'<tg-emoji emoji-id="5870734657384877785">🏳️</tg-emoji>';
const NO_ACTIVE = '<tg-emoji emoji-id="5927052244254986343">❕</tg-emoji>';
const FORBIDDEN = '<tg-emoji emoji-id="5872829476143894491">🚫</tg-emoji>';
const TURN_TIMER = '<tg-emoji emoji-id="5778550614669660455">⏰</tg-emoji>';
const ENTRY_ICON = '<tg-emoji emoji-id="5843799474362652262">▶️</tg-emoji>';
const ONESHOT_ICON = '<tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji>';
const ONESHOT_DIFFICULTIES: OneshotDifficulty[] = [
	"easy",
	"normal",
	"hard",
	"expert",
];

type StyledInlineButton = {
	text: string;
	callback_data: string;
	style: "success" | "primary" | "danger";
	icon_custom_emoji_id: string;
};

type StyledInlineKeyboard = {
	inline_keyboard: StyledInlineButton[][];
};

export function boardMessageIdsForCleanup(
	game: Pick<GameRow, "status">,
	messageIds: number[],
): number[] {
	return game.status === "solved" ? [] : messageIds;
}

function userRef(ctx: Context): UserRef {
	const u = ctx.from!;
	const name =
		[u.first_name, u.last_name].filter(Boolean).join(" ") ||
		u.username ||
		"Player";
	return {
		id: u.id,
		name,
		username: u.username,
		firstName: u.first_name || u.username || "Player",
	};
}

function telegramUserDisplayName(user: {
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

function chatDisplayName(ctx: Context): string {
	const chat = ctx.chat;
	if (!chat) return "Chat";
	if ("title" in chat && chat.title) return chat.title;
	if ("username" in chat && chat.username) return `@${chat.username}`;
	if ("first_name" in chat)
		return (
			[chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
			"Private chat"
		);
	return "Chat";
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

function tournamentStandingsHtml(t: TournamentRow): string {
	return [...t.players]
		.map((p) => ({ p, pts: t.scores[String(p.userId)] ?? 0 }))
		.sort((a, b) => b.pts - a.pts)
		.map(
			(r, i) => `${rankLabelHtml(i + 1)} ${playerNameLinkHtml(r.p)} · ${r.pts}`,
		)
		.join("\n");
}

function roundLabelHtml(t: TournamentRow): string {
	return `🏆 Round ${t.current_round}/${t.rounds}\n\n${tournamentStandingsHtml(t)}`;
}

function currentTournamentPlayer(t: TournamentRow) {
	const order = roundOrder(t.players, t.current_round);
	return order[t.turn_idx % order.length];
}

function tournamentStatusHtml(t: TournamentRow): string {
	return `${roundLabelHtml(t)}\n\nNext up ${playerMentionHtml(currentTournamentPlayer(t))}`;
}

function tournamentRejectStatusHtml(status?: TournamentRejectStatus): string {
	if (!status) return "";
	const remaining = ` ${status.remaining}/${status.limit} guesses left`;
	if (!status.forfeit) return remaining;
	return `${remaining}\n\n${NOT_SO_FAST} ${playerNameLinkHtml(status.forfeitedPlayer)} hit ${status.limit} rejected guesses and forfeits the turn.\nNext up ${playerMentionHtml(status.forfeit.nextPlayer)}`;
}

function tournamentTimerReminderHtml(
	player: TournamentRow["players"][number],
	secondsLeft: number,
): string {
	return `${TURN_TIMER} ${playerNameLinkHtml(player)}, ${humanTurnTime(secondsLeft)} left on your turn!`;
}

function tournamentTimerExpiredHtml(
	expiredPlayer: TournamentRow["players"][number],
	nextPlayer: TournamentRow["players"][number],
): string {
	return `${TURN_TIMER} ${playerNameLinkHtml(expiredPlayer)} ran out of time.\nNext up ${playerMentionHtml(nextPlayer)}`;
}

function messageThreadId(ctx: Context): number | undefined {
	const message = ctx.message ?? ctx.callbackQuery?.message;
	const threadId = (message as { message_thread_id?: unknown } | undefined)
		?.message_thread_id;
	return typeof threadId === "number" ? threadId : undefined;
}

function threadOptions(ctx: Context): { message_thread_id?: number } {
	const threadId = messageThreadId(ctx);
	return threadId === undefined ? {} : { message_thread_id: threadId };
}

async function userAvatar(
	ctx: Context,
	userId: number,
): Promise<Uint8Array | undefined> {
	try {
		const photos = await ctx.api.getUserProfilePhotos(userId, { limit: 1 });
		const photo = photos.photos[0]?.at(-1);
		if (!photo) return undefined;

		const file = await ctx.api.getFile(photo.file_id);
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

async function wordMeaning(word: string): Promise<string | undefined> {
	try {
		return await describeWordMeaning(word);
	} catch (error) {
		console.error("Failed to generate word meaning", error);
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

function lobbyText(t: TournamentRow): string {
	const names =
		t.players.length > 0
			? t.players.map(playerNameLinkHtml).join(", ")
			: "No players";
	const rounds = t.rounds > 0 ? ` · ${t.rounds}` : "";
	return `${PEOPLE_EMOJI} ${names}${rounds}

Players guess in order, ${MAX_GUESSES} max guesses, faster solution gives more points!`;
}

function lobbyKeyboard(t: TournamentRow): StyledInlineKeyboard {
	return {
		inline_keyboard: [
			[
				{
					text: "Join",
					callback_data: `t:join:${t.id}`,
					style: "success",
					icon_custom_emoji_id: JOIN_EMOJI_ID,
				},
				{
					text: "Start",
					callback_data: `t:start:${t.id}`,
					style: "primary",
					icon_custom_emoji_id: START_EMOJI_ID,
				},
			],
			[
				{
					text: "Quit",
					callback_data: `t:quit:${t.id}`,
					style: "danger",
					icon_custom_emoji_id: QUIT_EMOJI_ID,
				},
			],
		],
	};
}

export function registerHandlers(bot: Bot, db: Database): void {
	const svc = new GameService(db);
	const scheduledTimerEvents = new Set<string>();

	type StateMessageOptions = {
		headerHtml?: string;
		footer?: string;
		footerHtml?: string;
		captionHtml?: boolean;
		hideKeyboard?: boolean;
		stateChatId?: number;
	};

	async function sendStateMessage(
		ctx: Context,
		chatId: number,
		caption: string,
		boardText?: string,
		opts: StateMessageOptions = {},
	): Promise<number | null> {
		const textParts = [caption, boardText].filter((part): part is string =>
			Boolean(part),
		);
		const footerParts = [opts.footer].filter((part): part is string =>
			Boolean(part),
		);
		const messageParts = [
			opts.headerHtml,
			...textParts,
			...footerParts,
			opts.footerHtml,
		].filter(Boolean);

		if (messageParts.length === 0) return null;

		if (opts.headerHtml || opts.footerHtml || opts.captionHtml) {
			const escaped = textParts.map((part, index) =>
				index === 0 && opts.captionHtml ? part : escapeHtml(part),
			);
			const escapedFooter = footerParts.map(escapeHtml);
			const message = await ctx.api.sendMessage(
				chatId,
				[opts.headerHtml, ...escaped, ...escapedFooter, opts.footerHtml]
					.filter(Boolean)
					.join("\n\n"),
				{
					...threadOptions(ctx),
					parse_mode: "HTML",
				},
			);
			return message.message_id;
		}

		const message = await ctx.api.sendMessage(
			chatId,
			[...textParts, ...footerParts].join("\n\n"),
			threadOptions(ctx),
		);
		return message.message_id;
	}

	function sendTournamentTimerMessage(
		t: TournamentRow,
		html: string,
	): Promise<unknown> {
		return bot.api
			.sendMessage(t.chat_id, html, {
				...storedThreadOptions(t.message_thread_id),
				parse_mode: "HTML",
			})
			.catch((error) => {
				console.error("Failed to send tournament timer message", {
					error,
					tournamentId: t.id,
				});
			});
	}

	function liveTimedTournament(
		tournamentId: number,
		turnStartedAt: number,
		timerSeconds: number,
	): TournamentRow | null {
		const t = svc.getTournament(tournamentId);
		if (!t || t.status !== "active" || t.turn_started_at !== turnStartedAt)
			return null;
		if (svc.settings(t.chat_id).tournamentTurnSeconds !== timerSeconds)
			return null;
		return t;
	}

	function scheduleTournamentTimers(t: TournamentRow): void {
		const timerSeconds = svc.settings(t.chat_id).tournamentTurnSeconds;
		if (
			timerSeconds === null ||
			t.status !== "active" ||
			t.turn_started_at === null
		)
			return;

		const totalMs = timerSeconds * 1000;
		const elapsedMs = Date.now() - t.turn_started_at;
		const events = [
			...(timerSeconds > 60
				? [{ label: "half", delayMs: Math.round(totalMs * 0.5) - elapsedMs }]
				: []),
			{ label: "ninety", delayMs: Math.round(totalMs * 0.9) - elapsedMs },
			{ label: "expire", delayMs: totalMs - elapsedMs },
		];

		for (const event of events) {
			if (event.label !== "expire" && event.delayMs <= 0) continue;
			const key = `${t.id}:${t.turn_started_at}:${timerSeconds}:${event.label}`;
			if (scheduledTimerEvents.has(key)) continue;
			scheduledTimerEvents.add(key);

			setTimeout(
				() => {
					scheduledTimerEvents.delete(key);
					const live = liveTimedTournament(
						t.id,
						t.turn_started_at!,
						timerSeconds,
					);
					if (!live) return;

					if (event.label === "expire") {
						const expired = svc.expireTournamentTurn(t.id, t.turn_started_at!);
						if (!expired) return;
						void sendTournamentTimerMessage(
							expired.t,
							tournamentTimerExpiredHtml(
								expired.expiredPlayer,
								expired.nextPlayer,
							),
						);
						scheduleTournamentTimers(expired.t);
						return;
					}

					const secondsLeft = Math.max(
						1,
						Math.ceil((live.turn_started_at! + totalMs - Date.now()) / 1000),
					);
					void sendTournamentTimerMessage(
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

	function scheduleRejectedTurnForfeit(status?: TournamentRejectStatus): void {
		if (status?.forfeit) scheduleTournamentTimers(status.forfeit.t);
	}

	async function deleteMessages(
		ctx: Context,
		chatId: number,
		messageIds: number[],
	): Promise<void> {
		for (const messageId of messageIds) {
			await ctx.api.deleteMessage(chatId, messageId).catch(() => {});
		}
	}

	async function sendBoard(
		ctx: Context,
		chatId: number,
		game: GameRow,
		caption: string,
		opts: StateMessageOptions = {},
	): Promise<void> {
		const stateChatId = opts.stateChatId ?? chatId;
		const threadId = messageThreadId(ctx) ?? null;
		const settings = svc.settings(stateChatId);
		const previousMessageIds = settings.cleanup
			? svc.boardMessageIds(stateChatId, threadId)
			: [];
		const sentMessageIds: number[] = [];

		await deleteMessages(ctx, chatId, previousMessageIds);

		const boardMessage = await ctx.api.sendSticker(
			chatId,
			new InputFile(renderBoardSticker(game), "board.webp"),
			threadOptions(ctx),
		);
		sentMessageIds.push(boardMessage.message_id);
		const hideKeyboard = opts.hideKeyboard || game.status !== "active";
		if (!hideKeyboard) {
			const keyboardMessage = await ctx.api.sendSticker(
				chatId,
				new InputFile(renderKeyboardSticker(game), "keyboard.webp"),
				threadOptions(ctx),
			);
			sentMessageIds.push(keyboardMessage.message_id);
		}
		const stateMessageId = await sendStateMessage(
			ctx,
			chatId,
			caption,
			undefined,
			opts,
		);
		if (stateMessageId !== null) sentMessageIds.push(stateMessageId);

		svc.saveBoardMessageIds(
			stateChatId,
			threadId,
			boardMessageIdsForCleanup(game, sentMessageIds),
		);
	}

	function activePersonalTarget(
		ctx: Context,
	): { chatId: number; game: GameRow } | null {
		if (!ctx.chat || !ctx.from) return null;
		return svc.activePersonalGame(ctx.chat.id, ctx.from.id);
	}

	function guessStateChatId(ctx: Context): number {
		return activePersonalTarget(ctx)?.chatId ?? ctx.chat!.id;
	}

	function personalHeaderHtml(user: UserRef): string {
		return `<a href="tg://user?id=${user.id}">${escapeHtml(user.name)}</a>'s personal`;
	}

	async function handleGuess(
		ctx: Context,
		word: string,
		opts: { silentNoGame?: boolean; stateChatId?: number } = {},
	): Promise<void> {
		const chatId = ctx.chat!.id;
		const stateChatId = opts.stateChatId ?? guessStateChatId(ctx);
		const user = userRef(ctx);
		const personal = activePersonalTarget(ctx);
		const headerHtml =
			personal?.chatId === stateChatId ? personalHeaderHtml(user) : undefined;
		const out = svc.submitGuess(stateChatId, user, word);

		switch (out.type) {
			case "no_game":
				if (!opts.silentNoGame)
					await ctx.reply(
						`${NO_ACTIVE} No game running here. Send /wordle to start one!`,
						{ parse_mode: "HTML" },
					);
				return;
			case "not_a_word":
				await ctx.reply(
					`${NOT_ALLOWED} "${escapeHtml(out.word.toUpperCase())}" is not allowed.${tournamentRejectStatusHtml(out.rejectStatus)}`,
					{
						parse_mode: "HTML",
					},
				);
				scheduleRejectedTurnForfeit(out.rejectStatus);
				return;
			case "already_guessed":
				{
					const game = svc.activeGame(stateChatId)!;
					const settings = svc.settings(stateChatId);
					await ctx.reply(
						alreadyGuessedText(out.word, game.answer, settings.emojiPack),
						{ parse_mode: "HTML" },
					);
				}
				return;
			case "creativity_blocked":
				await ctx.reply(
					`${FORBIDDEN} Creativity mode: ${escapeHtml(out.word.toUpperCase())} was used recently here. Try something fresh!${tournamentRejectStatusHtml(out.rejectStatus)}`,
					{ parse_mode: "HTML" },
				);
				scheduleRejectedTurnForfeit(out.rejectStatus);
				return;
			case "hard_mode_violation":
				await ctx.reply(
					`${hardModeViolationText(out.violation, out.superHard, svc.settings(stateChatId).emojiPack)}${tournamentRejectStatusHtml(out.rejectStatus)}`,
					{
						parse_mode: "HTML",
					},
				);
				scheduleRejectedTurnForfeit(out.rejectStatus);
				return;
			case "ignored":
				return;
			case "not_your_turn":
				await ctx.reply(
					`${NOT_SO_FAST} Not so fast — it's ${playerNameLinkHtml(out.currentPlayer)}'s turn.`,
					{
						parse_mode: "HTML",
					},
				);
				return;
		}

		const { game, guessNumber, solved, lost, tournament, duel, quality } = out;
		const maxGuesses = maxGuessesForGame(game);
		const lines: string[] = [];

		async function maybeRoastGuess(): Promise<void> {
			const roastEnabled = svc.settings(chatId).roast;
			const belowAverage = isBelowAverageQuality(quality);
			const logSkip = (reason: string) =>
				console.debug("[guess-roast]", {
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
				const messageId = ctx.message?.message_id;
				await ctx.reply(
					roast,
					messageId
						? { reply_parameters: { message_id: messageId } }
						: undefined,
				);
			} catch (error) {
				console.error("Failed to generate guess roast", {
					error,
					chatId: stateChatId,
					userId: user.id,
					word: word.toUpperCase(),
					quality,
				});
			}
		}

		const finishedMeaning =
			solved || lost ? await wordMeaning(game.answer) : undefined;
		const finishedMeaningHtml = finishedMeaning
			? escapeHtml(finishedMeaning)
			: undefined;

		if (lost) {
			if (duel)
				lines.push(
					`${OUT_OF_GUESSES} Out of guesses! The word stays secret until your opponent finishes.`,
				);
			else
				lines.push(
					`${OUT_OF_GUESSES} Out of guesses! The word was ${answerMeaningSentence(game.answer, finishedMeaningHtml)}`,
				);
		}

		if (tournament) {
			const {
				t,
				pointsAwarded,
				roundEnded,
				tournamentEnded,
				nextGame,
				nextPlayer,
				winners,
			} = tournament;
			if (solved)
				lines.push(
					`🎉 ${user.name} got it in ${guessNumber}/${MAX_GUESSES} +${pointsAwarded}. ${answerMeaningText(game.answer, finishedMeaning)}`,
				);
			const nextUpFooter =
				!roundEnded && nextPlayer
					? `Next up ${playerMentionHtml(nextPlayer)}`
					: undefined;
			await sendBoard(ctx, chatId, game, lines.join("\n"), {
				footerHtml: nextUpFooter,
				captionHtml: lost,
				hideKeyboard: solved,
				stateChatId,
			});
			await maybeRoastGuess();

			if (tournamentEnded) {
				const winnerNames = winners.map(playerNameLinkHtml).join(" & ");
				await ctx.reply(
					`${TOURNAMENT_FINISHED} Tournament finished!\n\n${tournamentStandingsHtml(t)}\n\n${CROWN} Winner${winners.length > 1 ? "s" : ""}: ${winnerNames}`,
					{ parse_mode: "HTML" },
				);
			} else if (roundEnded && nextGame && nextPlayer) {
				await sendBoard(ctx, chatId, nextGame, "", {
					footerHtml: tournamentStatusHtml(t),
					stateChatId,
				});
				scheduleTournamentTimers(t);
			} else {
				scheduleTournamentTimers(t);
			}
			return;
		}

		if (solved) {
			lines.push(
				`🎉 ${user.name} got it in ${guessNumber}/${maxGuesses}. ${answerMeaningText(game.answer, finishedMeaning)}`,
			);
		}

		if (duel) {
			await sendBoard(ctx, chatId, game, lines.join("\n"), {
				captionHtml: lost,
				hideKeyboard: solved,
				stateChatId,
			});
			const { d, finished, bothDone } = duel;
			if (finished && !bothDone) {
				await ctx.reply(
					"⚔️ Your board is done! I will announce the result once your opponent finishes.",
				);
			}
			if (bothDone) {
				const winner = svc.duelWinner(d);
				const describe = (p: typeof d.challenger) =>
					p.solved
						? `${p.userName}: solved in ${p.guesses}/${MAX_GUESSES} (${humanMs(p.ms!)})`
						: `${p.userName}: failed`;
				const verdict =
					winner === "draw"
						? "🤝 It's a draw!"
						: `👑 ${(winner as { userName: string }).userName} wins the duel!`;
				const summary = `⚔️ Duel finished! The word was ${answerMeaningSentence(d.answer, finishedMeaning)}\n\n${describe(d.challenger)}\n${describe(d.opponent!)}\n\n${verdict}`;
				await ctx.reply(summary);
				await ctx.api
					.sendMessage(
						d.chat_id,
						summary,
						storedThreadOptions(d.message_thread_id),
					)
					.catch(() => {});
			}
			return;
		}

		await sendBoard(ctx, chatId, game, lines.join("\n"), {
			headerHtml,
			captionHtml: lost,
			hideKeyboard: solved,
			stateChatId,
		});
		await maybeRoastGuess();
	}

	async function setDifficulty(
		ctx: Context,
		difficulty: "normal" | "hard" | "superhard",
	): Promise<void> {
		const chatId = ctx.chat!.id;
		const s = svc.settings(chatId);
		s.difficulty = difficulty;
		svc.saveSettings(chatId, s);
		const labels = {
			normal: "Normal",
			hard: '<tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> Hard',
			superhard:
				'<tg-emoji emoji-id="5282737683053980256">🔠</tg-emoji> Super-hard',
		};
		await ctx.reply(`Difficulty set to ${labels[difficulty]}`, {
			parse_mode: "HTML",
		});
	}

	function creativityEnabledText(s: {
		creativity: { mode: "time" | "count"; seconds: number; count: number };
	}): string {
		const frame =
			s.creativity.mode === "time"
				? `last <b>${humanDuration(s.creativity.seconds)}</b>`
				: `last <b>${s.creativity.count} words</b>`;
		return `<tg-emoji emoji-id="5825794181183836432">✅</tg-emoji> Creativity mode enabled\nFrame: ${frame}`;
	}

	function tickText(text: string): string {
		return `<tg-emoji emoji-id="5825794181183836432">✅</tg-emoji> ${text}`;
	}

	function forbiddenText(text: string): string {
		return `${FORBIDDEN} ${text}`;
	}

	function expectedGuessLength(ctx: Context): number {
		const stateChatId = guessStateChatId(ctx);
		return (
			svc.activeGame(stateChatId)?.answer.length ??
			svc.settings(ctx.chat!.id).wordLength
		);
	}

	function playGuessInstruction(bareWord: boolean, length: number): string {
		return bareWord
			? `Send a ${length}-letter word to guess`
			: `Guess with /w [${length}-letter word]`;
	}

	function autoGuessInstruction(bareWord: boolean, length: number): string {
		return bareWord
			? `Send a ${length}-letter word to guess`
			: `Use /w [${length}-letter word] to guess`;
	}

	async function setLanguage(
		ctx: Context,
		language: WordLanguage,
	): Promise<void> {
		const chatId = ctx.chat!.id;
		svc.setLanguage(chatId, language);
		const active = svc.activeGame(chatId);
		const suffix =
			active && active.language !== language
				? `\nCurrent game stays ${LANGUAGE_LABELS[active.language]}.`
				: "";
		await ctx.reply(
			tickText(`${LANGUAGE_LABELS[language]} selected${suffix}`),
			{ parse_mode: "HTML" },
		);
	}

	async function setWordLength(ctx: Context): Promise<void> {
		const chatId = ctx.chat!.id;
		const value = String(ctx.match ?? "").trim();
		const length = parseInt(value, 10);
		if (!/^\d+$/.test(value) || !svc.setWordLength(chatId, length)) {
			return void (await ctx.reply(
				`Usage: /length N, where N is ${MIN_WORD_LENGTH}-${MAX_WORD_LENGTH}`,
			));
		}
		const active = svc.activeGame(chatId);
		const suffix =
			active && active.answer.length !== length
				? `\nCurrent game stays ${active.answer.length} letters.`
				: "";
		await ctx.reply(tickText(`Word length set to ${length}${suffix}`), {
			parse_mode: "HTML",
		});
	}

	// ---------- commands ----------

	async function replyHelp(ctx: Context): Promise<void> {
		await ctx.reply(helpText(svc.settings(ctx.chat!.id)), {
			parse_mode: "HTML",
			link_preview_options: { is_disabled: true },
		});
	}

	bot.command("start", async (ctx) => {
		const payload = (ctx.match ?? "").trim();
		if (payload.startsWith("duel_")) {
			const duelId = parseInt(payload.slice(5), 10);
			if (ctx.chat.type !== "private" || !Number.isFinite(duelId)) return;
			const res = svc.acceptDuel(duelId, ctx.chat.id, userRef(ctx));
			if (res === "not_found")
				return void (await ctx.reply(
					"This duel no longer exists or is already finished.",
				));
			if (res === "full")
				return void (await ctx.reply("This duel already has two players."));
			if (res === "already_playing")
				return void (await ctx.reply(
					"You already played your board for this duel.",
				));
			if (res === "own_game_running")
				return void (await ctx.reply(
					"Finish your current game here first (/stop to abandon it).",
				));
			await ctx.reply(
				`⚔️ Duel on! Same word as your opponent, 6 tries. Just type your ${res.game.answer.length}-letter guesses.`,
			);
			await sendBoard(ctx, ctx.chat.id, res.game, "Your duel board:");
			return;
		}
		await replyHelp(ctx);
	});

	bot.command("help", (ctx) => replyHelp(ctx));

	bot.command("en", (ctx) => setLanguage(ctx, "en"));
	bot.command("ru", (ctx) => setLanguage(ctx, "ru"));
	bot.command("length", (ctx) => setWordLength(ctx));

	bot.command("auto", async (ctx) => {
		const s = svc.settings(ctx.chat.id);
		s.bareWord = !s.bareWord;
		svc.saveSettings(ctx.chat.id, s);
		const text = `Guess without /w ${s.bareWord ? "enabled" : "disabled"}\n${autoGuessInstruction(s.bareWord, expectedGuessLength(ctx))}`;
		await ctx.reply(s.bareWord ? tickText(text) : forbiddenText(text), {
			parse_mode: "HTML",
		});
	});

	bot.command("cleanup", async (ctx) => {
		const s = svc.settings(ctx.chat.id);
		s.cleanup = !s.cleanup;
		svc.saveSettings(ctx.chat.id, s);
		const text = `Cleanup ${s.cleanup ? "enabled" : "disabled"}\nPrevious unsolved boards will ${s.cleanup ? "" : "not "}be removed when a new board is posted`;
		await ctx.reply(s.cleanup ? tickText(text) : forbiddenText(text), {
			parse_mode: "HTML",
		});
	});

	bot.command("roast", async (ctx) => {
		const s = svc.settings(ctx.chat.id);
		s.roast = !s.roast;
		svc.saveSettings(ctx.chat.id, s);
		const text = `Roasts ${s.roast ? "enabled" : "disabled"}\nBelow-average guesses will ${s.roast ? "" : "not "}get one LLM roast`;
		await ctx.reply(s.roast ? tickText(text) : forbiddenText(text), {
			parse_mode: "HTML",
		});
	});

	bot.command("usepack", async (ctx) => {
		const requestedName = (ctx.match ?? "").trim();
		if (!requestedName) {
			return void (await ctx.reply("Usage: /usepack name"));
		}

		let lastError: unknown = null;
		for (const packName of packNameCandidates(requestedName, ctx.me.username)) {
			try {
				const stickerSet = await ctx.api.getStickerSet(packName);
				if (stickerSet.sticker_type !== "custom_emoji") {
					return void (await ctx.reply(
						`${packName} is not a custom emoji pack.`,
					));
				}

				const s = svc.settings(ctx.chat.id);
				s.emojiPack = emojiPackFromStickers(packName, stickerSet.stickers);
				svc.saveSettings(ctx.chat.id, s);
				await ctx.reply(
					`${tickText("Custom emoji pack enabled")}\nPack: https://t.me/addemoji/${packName}`,
					{
						parse_mode: "HTML",
					},
				);
				return;
			} catch (error) {
				lastError = error;
			}
		}

		const message =
			lastError instanceof Error ? lastError.message : String(lastError);
		await ctx.reply(`Could not use emoji pack: ${message}`);
	});

	bot.command("wordle", async (ctx) => {
		const chatId = ctx.chat.id;
		const t = svc.openTournament(chatId);
		if (t)
			return void (await ctx.reply(
				"A tournament is open in this chat — finish it with /stop first.",
			));
		const game = svc.startGame(chatId);
		if (!game)
			return void (await ctx.reply(
				"A game is already running! Check /board or /stop to abandon it.",
			));
		const s = svc.settings(chatId);
		await sendBoard(
			ctx,
			chatId,
			game,
			`${playGuessInstruction(s.bareWord, game.answer.length)}`,
		);
	});

	bot.command("personal", async (ctx) => {
		const chatId = ctx.chat.id;
		const user = userRef(ctx);
		const started = svc.startPersonalGame(chatId, user.id);
		if (!started)
			return void (await ctx.reply(
				"You already have a personal game running! Check /board or /stop to abandon it.",
			));
		await sendBoard(
			ctx,
			chatId,
			started.game,
			`${started.game.answer.length} letters`,
			{
				headerHtml: personalHeaderHtml(user),
				stateChatId: started.chatId,
			},
		);
	});

	bot.command("daily", async (ctx) => {
		const chatId = ctx.chat.id;
		const t = svc.openTournament(chatId);
		if (t)
			return void (await ctx.reply(
				"A tournament is open in this chat — finish it with /stop first.",
			));
		let started: Awaited<ReturnType<GameService["startDailyGame"]>>;
		try {
			started = await svc.startDailyGame(chatId);
		} catch (error) {
			console.error("Failed to start daily wordle", { error, chatId });
			return void (await ctx.reply(
				"Could not fetch today's Wordle. Try again in a bit.",
			));
		}
		if (started.type === "active") {
			return void (await ctx.reply(
				"A game is already running! Check /board or /stop to abandon it.",
			));
		}
		if (started.type === "already_done") {
			return void (await ctx.reply(
				`${ENTRY_ICON} Daily word ${escapeHtml(started.word.toUpperCase())} was already guessed!`,
				{
					parse_mode: "HTML",
				},
			));
		}
		const game = started.game;
		const s = svc.settings(chatId);
		await sendBoard(
			ctx,
			chatId,
			game,
			`${playGuessInstruction(s.bareWord, game.answer.length)}`,
		);
	});

	bot.command("oneshot", async (ctx) => {
		const chatId = ctx.chat.id;
		const arg = (ctx.match ?? "").trim().toLowerCase();

		if (arg) {
			if (!ONESHOT_DIFFICULTIES.includes(arg as OneshotDifficulty)) {
				return void (await ctx.reply(
					"Usage: /oneshot [easy|normal|hard|expert]",
				));
			}
			const s = svc.setOneshotDifficulty(chatId, arg as OneshotDifficulty);
			return void (await ctx.reply(
				tickText(`One-shot difficulty set to ${s.oneshotDifficulty}`),
				{ parse_mode: "HTML" },
			));
		}

		const t = svc.openTournament(chatId);
		if (t)
			return void (await ctx.reply(
				"A tournament is open in this chat — finish it with /stop first.",
			));
		if (svc.activeGame(chatId))
			return void (await ctx.reply(
				"A game is already running! Check /board or /stop to abandon it.",
			));

		const puzzle = svc.startOneshot(chatId);
		if (!puzzle)
			return void (await ctx.reply(
				"Could not find a one-shot puzzle for the current settings. Try another length or mode.",
			));

		await sendBoard(
			ctx,
			chatId,
			puzzle.game,
			`${ONESHOT_ICON} One-shot ${puzzle.mode} · ${puzzle.game.answer.length} letters`,
			{
				captionHtml: true,
			},
		);
	});

	bot.command("w", async (ctx) => {
		const word = (ctx.match ?? "").trim();
		const length = expectedGuessLength(ctx);
		if (!isGuessText(word, length)) {
			return void (await ctx.reply(`Usage: /w WORD (a ${length}-letter word)`));
		}
		await handleGuess(ctx, word);
	});

	bot.command("board", async (ctx) => {
		const chatId = ctx.chat.id;
		const personal = activePersonalTarget(ctx);
		const stateChatId = personal?.chatId ?? chatId;
		const game = personal?.game ?? svc.activeGame(chatId);
		const t = personal ? null : svc.openTournament(chatId);
		if (!game) {
			if (t && t.status === "joining")
				return void (await ctx.reply(lobbyText(t), {
					parse_mode: "HTML",
					reply_markup: lobbyKeyboard(t),
				}));
			return void (await ctx.reply(
				`${NO_ACTIVE} No active game. Send /wordle to start one!`,
				{ parse_mode: "HTML" },
			));
		}
		if (t && t.status === "active") {
			await sendBoard(ctx, chatId, game, "", {
				footerHtml: tournamentStatusHtml(t),
			});
			return;
		}
		await sendBoard(ctx, chatId, game, "", {
			headerHtml: personal ? personalHeaderHtml(userRef(ctx)) : undefined,
			stateChatId,
		});
	});

	bot.command("stop", async (ctx) => {
		const personal = activePersonalTarget(ctx);
		const res = svc.giveUp(personal?.chatId ?? ctx.chat.id);
		if (!res)
			return void (await ctx.reply(
				`${NO_ACTIVE} No active game or tournament to give up.`,
				{ parse_mode: "HTML" },
			));
		const meaning = res.answer ? await wordMeaning(res.answer) : undefined;
		const msg = res.answer
			? `${giveUpText(res.answer, meaning ? escapeHtml(meaning) : undefined)}${res.tournamentCancelled ? `\n\n${TOURNAMENT_CANCELLED} Tournament cancelled.` : ""}`
			: res.daily
				? `${TOURNAMENT_CANCELLED} Daily game stopped. The word stays hidden.`
				: `${TOURNAMENT_CANCELLED} Tournament cancelled.`;
		await ctx.reply(msg, { parse_mode: "HTML" });
	});

	bot.command("profile", async (ctx) => {
		const user = userRef(ctx);
		const row = svc.statsFor(ctx.chat.id, user.id);
		await ctx.reply(statsText(row, user.name, chatDisplayName(ctx)), {
			parse_mode: "HTML",
		});
	});

	bot.command("compare", async (ctx) => {
		const chatId = ctx.chat.id;
		const user = userRef(ctx);
		const arg = (ctx.match ?? "").trim();
		const repliedUser = ctx.message?.reply_to_message?.from;

		let target: {
			userId: number;
			name: string;
			stats: ReturnType<GameService["statsFor"]>;
		} | null = null;

		if (!arg && repliedUser) {
			target = {
				userId: repliedUser.id,
				name: telegramUserDisplayName(repliedUser),
				stats: svc.statsFor(chatId, repliedUser.id),
			};
		} else if (arg) {
			const row = svc.findStatsByName(chatId, arg);
			if (!row) {
				return void (await ctx.reply(
					"I do not know that player yet. Reply to one of their messages, or use the name they played under.",
				));
			}
			target = {
				userId: row.user_id,
				name: row.name || `User ${row.user_id}`,
				stats: row,
			};
		}

		if (!target) {
			return void (await ctx.reply(
				"Usage: reply with /compare, or use /compare NAME",
			));
		}
		if (target.userId === user.id) {
			return void (await ctx.reply("Pick someone else to compare with."));
		}

		const [userPhoto, targetPhoto] = await Promise.all([
			userAvatar(ctx, user.id),
			userAvatar(ctx, target.userId),
		]);
		await ctx.api.sendSticker(
			chatId,
			new InputFile(
				await renderCompareSticker(
					{
						name: user.name,
						stats: svc.statsFor(chatId, user.id),
						avatar: userPhoto,
					},
					{ name: target.name, stats: target.stats, avatar: targetPhoto },
				),
				"compare.webp",
			),
			threadOptions(ctx),
		);
	});

	bot.command("global", async (ctx) => {
		const user = userRef(ctx);
		const row = svc.globalStatsFor(user.id);
		await ctx.reply(statsText(row, user.name, "All chats"), {
			parse_mode: "HTML",
		});
	});

	bot.command("creativity", async (ctx) => {
		const chatId = ctx.chat.id;
		const arg = (ctx.match ?? "").trim();
		const s = svc.settings(chatId);

		if (!arg) {
			if (s.creativity.enabled) {
				s.creativity.enabled = false;
				svc.saveSettings(chatId, s);
				return void (await ctx.reply(
					forbiddenText("Creativity mode disabled"),
					{
						parse_mode: "HTML",
					},
				));
			}

			if (!s.creativity.configured) {
				return void (await ctx.reply(
					"Set a frame first: /creativity 30m or /creativity 15w",
				));
			}

			s.creativity.enabled = true;
			svc.saveSettings(chatId, s);
			return void (await ctx.reply(creativityEnabledText(s), {
				parse_mode: "HTML",
			}));
		}

		const parsed = parseCreativityValue(arg);
		if (!parsed) {
			return void (await ctx.reply(
				"Usage: /creativity 30m  |  /creativity 15w",
			));
		}

		s.creativity.enabled = true;
		s.creativity.configured = true;
		if ("seconds" in parsed) {
			s.creativity.mode = "time";
			s.creativity.seconds = parsed.seconds;
		} else {
			s.creativity.mode = "count";
			s.creativity.count = parsed.count;
		}
		svc.saveSettings(chatId, s);

		await ctx.reply(creativityEnabledText(s), { parse_mode: "HTML" });
	});

	bot.command("normal", async (ctx) => setDifficulty(ctx, "normal"));
	bot.command("hard", async (ctx) => setDifficulty(ctx, "hard"));
	bot.command("superhard", async (ctx) => setDifficulty(ctx, "superhard"));
	bot.command("wordle_help", async (ctx) =>
		ctx.reply(wordleHelpText(), { parse_mode: "HTML" }),
	);
	bot.command("oneshot_help", async (ctx) =>
		ctx.reply(oneshotHelpText(svc.settings(ctx.chat.id)), {
			parse_mode: "HTML",
		}),
	);
	bot.command("mode_help", async (ctx) =>
		ctx.reply(modeHelpText(svc.settings(ctx.chat.id)), { parse_mode: "HTML" }),
	);
	bot.command("creativity_help", async (ctx) =>
		ctx.reply(creativityHelpText(svc.settings(ctx.chat.id)), {
			parse_mode: "HTML",
		}),
	);
	bot.command("multiplayer_help", async (ctx) =>
		ctx.reply(multiplayerHelpText(svc.settings(ctx.chat.id)), {
			parse_mode: "HTML",
		}),
	);
	bot.command("stats_help", async (ctx) =>
		ctx.reply(statsHelpText(), { parse_mode: "HTML" }),
	);
	bot.command("preferences_help", async (ctx) =>
		ctx.reply(preferencesHelpText(svc.settings(ctx.chat.id)), {
			parse_mode: "HTML",
		}),
	);

	bot.command("fails", async (ctx) => {
		const chatId = ctx.chat.id;
		const value = (ctx.match ?? "").trim().toLowerCase();
		if (!value) {
			return void (await ctx.reply("Usage: /fails N  |  /fails off"));
		}

		const s = svc.settings(chatId);
		if (value === "off" || value === "unlimited") {
			s.tournamentMaxFails = null;
		} else {
			const n = parseInt(value, 10);
			if (!/^\d+$/.test(value) || n <= 0) {
				return void (await ctx.reply(
					"Usage: /fails N, where N is a positive number, or /fails off",
				));
			}
			s.tournamentMaxFails = n;
		}
		svc.saveSettings(chatId, s);
		const label =
			s.tournamentMaxFails === null
				? "off (unlimited)"
				: `${s.tournamentMaxFails}`;
		await ctx.reply(tickText(`Tournament max-fails set to ${label}`), {
			parse_mode: "HTML",
		});
	});

	bot.command("timer", async (ctx) => {
		const chatId = ctx.chat.id;
		const value = (ctx.match ?? "").trim();
		const s = svc.settings(chatId);

		if (!value) {
			s.tournamentTurnSeconds = null;
			svc.saveSettings(chatId, s);
			return void (await ctx.reply(
				forbiddenText("Tournament turn timer disabled"),
				{ parse_mode: "HTML" },
			));
		}

		const seconds = parseTournamentTimerValue(value);
		if (seconds === null) {
			return void (await ctx.reply(
				"Usage: /timer 90s  |  /timer 2m\nSend /timer with no value to disable it.",
			));
		}

		s.tournamentTurnSeconds = seconds;
		svc.saveSettings(chatId, s);
		const activeTournament = svc.resetActiveTournamentTurnTimer(chatId);
		if (activeTournament) scheduleTournamentTimers(activeTournament);
		await ctx.reply(
			tickText(`Tournament turn timer set to ${humanTurnTime(seconds)}`),
			{ parse_mode: "HTML" },
		);
	});

	bot.command("round", async (ctx) => {
		const chatId = ctx.chat.id;
		const arg = (ctx.match ?? "").trim().toLowerCase();
		if (arg && !/^\d+$/.test(arg))
			return void (await ctx.reply(
				"Usage: /round [N]. Use /stop to end an open tournament.",
			));
		const existing = svc.openTournament(chatId);
		if (existing) {
			if (existing.status === "joining")
				return void (await ctx.reply(lobbyText(existing), {
					parse_mode: "HTML",
					reply_markup: lobbyKeyboard(existing),
				}));
			return void (await ctx.reply(tournamentStandingsHtml(existing), {
				parse_mode: "HTML",
			}));
		}
		const parsedRounds = parseInt(arg, 10);
		const rounds =
			Number.isFinite(parsedRounds) && parsedRounds >= 1 && parsedRounds <= 25
				? parsedRounds
				: 0;
		if (svc.activeGame(chatId))
			return void (await ctx.reply(
				"Finish the current game first (/stop to abandon it).",
			));
		const t = svc.createTournament(
			chatId,
			rounds,
			userRef(ctx),
			messageThreadId(ctx) ?? null,
		);
		if (!t)
			return void (await ctx.reply("Could not create a tournament right now."));
		await ctx.reply(lobbyText(t), {
			parse_mode: "HTML",
			reply_markup: lobbyKeyboard(t),
		});
	});

	bot.command("duel", async (ctx) => {
		if (ctx.chat.type === "private") {
			return void (await ctx.reply(
				"Use /duel in a group — that is where I announce the winner!",
			));
		}
		const user = userRef(ctx);
		const d = svc.createDuel(ctx.chat.id, user, messageThreadId(ctx) ?? null);
		const link = `https://t.me/${ctx.me.username}?start=duel_${d.id}`;
		await ctx.reply(
			`⚔️ ${user.name} challenges the chat to a duel!\n\nSame secret word for both players, ${MAX_GUESSES} tries each in a private chat with me. Fewest guesses wins; speed breaks ties.\n\nFirst person to tap becomes the opponent. ${user.name}, tap too to play your board!`,
			{ reply_markup: new InlineKeyboard().url("⚔️ Play the duel", link) },
		);
	});

	// ---------- callbacks ----------

	bot.callbackQuery(/^t:join:(\d+)$/, async (ctx) => {
		const res = svc.joinTournament(parseInt(ctx.match[1], 10), userRef(ctx));
		if (!res || res === "closed")
			return void (await ctx.answerCallbackQuery(
				"This tournament is not open for joining.",
			));
		if (res === "already_in")
			return void (await ctx.answerCallbackQuery("You are already in!"));
		await ctx.editMessageText(lobbyText(res), {
			parse_mode: "HTML",
			reply_markup: lobbyKeyboard(res),
		});
		await ctx.answerCallbackQuery("Joined! 🏆");
	});

	bot.callbackQuery(/^t:quit:(\d+)$/, async (ctx) => {
		const res = svc.quitTournament(parseInt(ctx.match[1], 10), ctx.from.id);
		if (!res || res === "closed")
			return void (await ctx.answerCallbackQuery(
				"This tournament is not open for joining.",
			));
		if (res === "not_in")
			return void (await ctx.answerCallbackQuery(
				"You are not in this tournament.",
			));
		if (res.status === "cancelled") {
			await ctx.editMessageText(
				`${TOURNAMENT_CANCELLED} Tournament cancelled.`,
				{
					parse_mode: "HTML",
					reply_markup: { inline_keyboard: [] },
				},
			);
			return void (await ctx.answerCallbackQuery(
				"Quit. Tournament cancelled.",
			));
		}
		await ctx.editMessageText(lobbyText(res), {
			parse_mode: "HTML",
			reply_markup: lobbyKeyboard(res),
		});
		await ctx.answerCallbackQuery("Quit.");
	});

	bot.callbackQuery(/^t:start:(\d+)$/, async (ctx) => {
		const id = parseInt(ctx.match[1], 10);
		const t = svc.openTournament(ctx.chat!.id);
		if (!t || t.id !== id)
			return void (await ctx.answerCallbackQuery(
				"This tournament is no longer open.",
			));
		if (t.created_by !== ctx.from.id)
			return void (await ctx.answerCallbackQuery(
				"Only the creator can start it.",
			));
		const res = svc.startTournament(id);
		if (res === "too_few")
			return void (await ctx.answerCallbackQuery("Need at least 2 players!"));
		if (!res)
			return void (await ctx.answerCallbackQuery(
				"Could not start the tournament.",
			));
		await ctx.answerCallbackQuery("Game on!");
		await ctx.editMessageText(lobbyText(res.t), {
			parse_mode: "HTML",
			reply_markup: { inline_keyboard: [] },
		});
		await sendBoard(ctx, ctx.chat!.id, res.game, "", {
			footerHtml: tournamentStatusHtml(res.t),
		});
		scheduleTournamentTimers(res.t);
	});

	// ---------- bare-word guessing ----------

	bot.on("message:text", async (ctx) => {
		const text = ctx.message.text.trim();
		if (text.startsWith("/")) return;
		if (!isGuessText(text, expectedGuessLength(ctx))) return;
		if (!svc.settings(ctx.chat.id).bareWord) return;
		await handleGuess(ctx, text, {
			silentNoGame: true,
			stateChatId: guessStateChatId(ctx),
		});
	});

	for (const t of svc.activeTournaments()) scheduleTournamentTimers(t);
}
