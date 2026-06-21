import {
	type ChatSettings,
	createGame,
	createTournament,
	type Database,
	type Difficulty,
	findStatsByName,
	type GameRow,
	type GuessEntry,
	getActiveGame,
	getActiveTournaments,
	getBoardMessageIds,
	getCompletedDailyGame,
	getGlobalStats,
	getOpenTournament,
	getOrCreatePersonalScopeChatId,
	getPausedDailyGame,
	getPersonalScopeChatId,
	getSettings,
	getStats,
	getTournament,
	type OneshotDifficulty,
	recentWords,
	recordUsedWord,
	saveBoardMessageIds,
	saveSettings,
	type TournamentPlayer,
	type TournamentRow,
	updateGame,
	updateTournament,
} from "../app/data.ts";
import { createLogger } from "../log.ts";
import {
	applyGameEndStats,
	applyGuessStats,
	applyTournamentStats,
} from "../stats/apply.ts";
import {
	nextTurnStartedAt,
	pointsForGuessNumber,
	roundOrder,
	tournamentWinners,
} from "../tournament/rules.ts";
import { dailyAnswer, dateKey } from "./daily.ts";
import { maxGuessesForGame } from "./guess.ts";
import { type GuessQuality, guessQuality } from "./guess-quality.ts";
import { type HardModeViolation, hardModeViolation } from "./hardmode.ts";
import { isSupportedWordLength, type WordLanguage } from "./language.ts";
import { buildOneshotPuzzle, impossibleOneshotTarget } from "./oneshot.ts";
import { scoreGuess, type TileStatus } from "./score.ts";
import { answersForLanguage, isValidWord, pickAnswer } from "./words.ts";

const log = createLogger("game");

export interface UserRef {
	id: number;
	name: string;
	username?: string;
	firstName?: string;
}

type FetchLike = typeof fetch;

export type StartDailyGameOutcome =
	| { type: "started"; game: GameRow }
	| { type: "resumed"; game: GameRow }
	| { type: "active"; game: GameRow }
	| { type: "already_done"; word: string; game: GameRow };

export interface GiveUpOutcome {
	answer: string | null;
	language: WordLanguage | null;
	tournamentCancelled: boolean;
	daily: boolean;
}

export interface OneshotPuzzle {
	mode: OneshotDifficulty;
	game: GameRow;
	opener: string;
	answer: string;
	score: TileStatus[];
}

function roundedQualityValue(n: number): number {
	return Math.round(n * 100) / 100;
}

function logGuessQuality(input: {
	chatId: number;
	game: GameRow;
	user: UserRef;
	word: string;
	guessNumber: number;
	quality?: GuessQuality;
}): void {
	const base = {
		chatId: input.chatId,
		gameId: input.game.id,
		kind: input.game.kind,
		userId: input.user.id,
		word: input.word.toUpperCase(),
		guessNumber: input.guessNumber,
	};

	log.debug(
		"Guess quality",
		input.quality
			? {
					...base,
					possible: input.quality.possibleCount,
					remaining: input.quality.actualRemaining,
					average: roundedQualityValue(input.quality.averageRemaining),
					points: input.quality.points,
					belowAverage:
						input.quality.actualRemaining > input.quality.averageRemaining,
				}
			: { ...base, quality: "skipped" },
	);
}

export interface TournamentRejectStatus {
	forfeitedPlayer: TournamentPlayer;
	failCount: number;
	limit: number;
	remaining: number;
	forfeit?: {
		t: TournamentRow;
		nextPlayer: TournamentPlayer;
	};
}

export interface TournamentTurnExpiredOutcome {
	t: TournamentRow;
	expiredPlayer: TournamentPlayer;
	nextPlayer: TournamentPlayer;
}

export type GuessOutcome =
	| { type: "no_game" }
	| { type: "not_a_word"; word: string; rejectStatus?: TournamentRejectStatus }
	| {
			type: "creativity_blocked";
			word: string;
			rejectStatus?: TournamentRejectStatus;
	  }
	| {
			type: "hard_mode_violation";
			word: string;
			violation: HardModeViolation;
			difficulty: Difficulty;
			rejectStatus?: TournamentRejectStatus;
	  }
	| { type: "already_guessed"; word: string }
	| { type: "ignored" }
	| { type: "not_your_turn"; currentPlayer: TournamentPlayer }
	| {
			type: "accepted";
			game: GameRow;
			score: TileStatus[];
			quality?: GuessQuality;
			guessNumber: number;
			solved: boolean;
			lost: boolean;
			tournament?: {
				t: TournamentRow;
				pointsAwarded: number;
				roundEnded: boolean;
				tournamentEnded: boolean;
				nextGame: GameRow | null;
				nextPlayer: TournamentPlayer | null;
				winners: TournamentPlayer[];
			};
	  };

export class GameService {
	private readonly fetchImpl: FetchLike;
	private readonly now: () => Date;

	constructor(
		private db: Database,
		opts: { fetch?: FetchLike; now?: () => Date } = {},
	) {
		this.fetchImpl = opts.fetch ?? fetch;
		this.now = opts.now ?? (() => new Date());
	}

	settings(chatId: number): Promise<ChatSettings> {
		return getSettings(this.db, chatId);
	}

	saveSettings(chatId: number, s: ChatSettings): Promise<void> {
		log.debug("Saving chat settings", {
			chatId,
			language: s.language,
			wordLength: s.wordLength,
			bareWord: s.bareWord,
			cleanup: s.cleanup,
			roast: s.roast,
			difficulty: s.difficulty,
			oneshotDifficulty: s.oneshotDifficulty,
			creativityEnabled: s.creativity.enabled,
			tournamentMaxFails: s.tournamentMaxFails,
			tournamentTurnSeconds: s.tournamentTurnSeconds,
			hasEmojiPack: s.emojiPack !== null,
		});
		return saveSettings(this.db, chatId, s);
	}

	async setLanguage(
		chatId: number,
		language: WordLanguage,
	): Promise<ChatSettings> {
		const s = await getSettings(this.db, chatId);
		s.language = language;
		await saveSettings(this.db, chatId, s);
		log.debug("Set language", { chatId, language });
		return s;
	}

	async setWordLength(
		chatId: number,
		length: number,
	): Promise<ChatSettings | null> {
		if (!isSupportedWordLength(length)) return null;
		const s = await getSettings(this.db, chatId);
		s.wordLength = length;
		await saveSettings(this.db, chatId, s);
		log.debug("Set word length", { chatId, length });
		return s;
	}

	async setOneshotDifficulty(
		chatId: number,
		difficulty: OneshotDifficulty,
	): Promise<ChatSettings> {
		const s = await getSettings(this.db, chatId);
		s.oneshotDifficulty = difficulty;
		await saveSettings(this.db, chatId, s);
		log.debug("Set oneshot difficulty", { chatId, difficulty });
		return s;
	}

	boardMessageIds(
		chatId: number,
		messageThreadId: number | null,
	): Promise<number[]> {
		return getBoardMessageIds(this.db, chatId, messageThreadId);
	}

	saveBoardMessageIds(
		chatId: number,
		messageThreadId: number | null,
		messageIds: number[],
	): Promise<void> {
		return saveBoardMessageIds(this.db, chatId, messageThreadId, messageIds);
	}

	activeGame(chatId: number): Promise<GameRow | null> {
		return getActiveGame(this.db, chatId);
	}

	openTournament(chatId: number): Promise<TournamentRow | null> {
		return getOpenTournament(this.db, chatId);
	}

	getTournament(tournamentId: number): Promise<TournamentRow | null> {
		return getTournament(this.db, tournamentId);
	}

	activeTournaments(): Promise<TournamentRow[]> {
		return getActiveTournaments(this.db);
	}

	/** Start a regular game. Returns null if a game is already running. */
	async startGame(chatId: number): Promise<GameRow | null> {
		if (await getActiveGame(this.db, chatId)) {
			log.debug("Start game blocked by active game", { chatId });
			return null;
		}
		const s = await getSettings(this.db, chatId);
		const answer = pickAnswer(
			s.language,
			s.wordLength,
			await recentWords(this.db, chatId, s.creativity),
		);
		const game = await createGame(
			this.db,
			chatId,
			answer,
			s.language,
			"normal",
		);
		log.debug("Started game", {
			chatId,
			gameId: game.id,
			language: game.language,
			wordLength: game.answer.length,
		});
		return game;
	}

	async startOneshot(chatId: number): Promise<OneshotPuzzle | null> {
		if (await getActiveGame(this.db, chatId)) {
			log.debug("Start oneshot blocked by active game", { chatId });
			return null;
		}
		const settings = await getSettings(this.db, chatId);
		const words = answersForLanguage(settings.language, settings.wordLength);
		if (
			impossibleOneshotTarget(settings.wordLength, settings.oneshotDifficulty)
		) {
			log.warn("Start oneshot blocked by impossible target", {
				chatId,
				wordLength: settings.wordLength,
				difficulty: settings.oneshotDifficulty,
			});
			return null;
		}

		const puzzle = buildOneshotPuzzle(words, settings.oneshotDifficulty);
		if (puzzle) {
			const now = Date.now();
			const game = await createGame(
				this.db,
				chatId,
				puzzle.answer,
				settings.language,
				"oneshot",
			);
			game.guesses.push({
				word: puzzle.opener,
				userId: 0,
				userName: "One-shot",
				ts: now,
			});
			await updateGame(this.db, game);
			log.debug("Started oneshot game", {
				chatId,
				gameId: game.id,
				language: game.language,
				wordLength: game.answer.length,
				difficulty: settings.oneshotDifficulty,
			});

			return {
				mode: puzzle.mode,
				game: (await getActiveGame(this.db, chatId))!,
				opener: puzzle.opener,
				answer: puzzle.answer,
				score: puzzle.score,
			};
		}

		log.warn("Start oneshot failed to find candidate", {
			chatId,
			language: settings.language,
			wordLength: settings.wordLength,
			difficulty: settings.oneshotDifficulty,
		});
		return null;
	}

	personalGameChatId(chatId: number, userId: number): Promise<number> {
		return getOrCreatePersonalScopeChatId(this.db, chatId, userId);
	}

	async activePersonalGame(
		chatId: number,
		userId: number,
	): Promise<{ chatId: number; game: GameRow } | null> {
		const personalChatId = await getPersonalScopeChatId(
			this.db,
			chatId,
			userId,
		);
		if (personalChatId === null) return null;
		const game = await getActiveGame(this.db, personalChatId);
		return game ? { chatId: personalChatId, game } : null;
	}

	/** Start a personal game in this chat for one user. Returns null if their personal game is already running. */
	async startPersonalGame(
		chatId: number,
		userId: number,
	): Promise<{ chatId: number; game: GameRow } | null> {
		const personalChatId = await this.personalGameChatId(chatId, userId);
		if (await getActiveGame(this.db, personalChatId)) {
			log.debug("Start personal game blocked by active personal game", {
				chatId,
				personalChatId,
				userId,
			});
			return null;
		}
		await saveSettings(
			this.db,
			personalChatId,
			await getSettings(this.db, chatId),
		);
		const game = await this.startGame(personalChatId);
		if (game)
			log.debug("Started personal game", {
				chatId,
				personalChatId,
				userId,
				gameId: game.id,
			});
		return game ? { chatId: personalChatId, game } : null;
	}

	/** Start today's normal daily game. The answer is shared per date/language and each chat can finish it once. */
	async startDailyGame(chatId: number): Promise<StartDailyGameOutcome> {
		const active = await getActiveGame(this.db, chatId);
		if (active) {
			log.debug("Start daily blocked by active game", {
				chatId,
				gameId: active.id,
			});
			return { type: "active", game: active };
		}

		const settings = await getSettings(this.db, chatId);
		const language = settings.language;
		const date = dateKey(this.now());
		const completed = await getCompletedDailyGame(
			this.db,
			chatId,
			date,
			language,
		);
		if (completed) {
			log.debug("Daily already completed", {
				chatId,
				gameId: completed.id,
				date,
				language,
			});
			return { type: "already_done", word: completed.answer, game: completed };
		}

		const paused = await getPausedDailyGame(this.db, chatId, date, language);
		if (paused) {
			paused.status = "active";
			paused.finished_at = null;
			await updateGame(this.db, paused);
			log.debug("Resumed daily game", {
				chatId,
				gameId: paused.id,
				date,
				language,
			});
			return { type: "resumed", game: (await getActiveGame(this.db, chatId))! };
		}

		const answer = await dailyAnswer(this.db, date, language, this.fetchImpl);
		const game = await createGame(this.db, chatId, answer, language, "normal", {
			dailyDate: date,
		});
		log.debug("Started daily game", {
			chatId,
			gameId: game.id,
			date,
			language,
		});
		return { type: "started", game };
	}

	/** Abort the current game, or cancel an open tournament lobby. Returns the revealed answer when it can be shown. */
	async giveUp(chatId: number): Promise<GiveUpOutcome | null> {
		const game = await getActiveGame(this.db, chatId);
		if (!game) {
			const t = await getOpenTournament(this.db, chatId);
			if (!t || t.status !== "joining") {
				log.debug("Give up ignored without active game or cancellable lobby", {
					chatId,
				});
				return null;
			}
			t.status = "cancelled";
			await updateTournament(this.db, t);
			log.debug("Cancelled tournament lobby via give up", {
				chatId,
				tournamentId: t.id,
			});
			return {
				answer: null,
				language: null,
				tournamentCancelled: true,
				daily: false,
			};
		}
		const daily = game.daily_date !== null;
		game.status = daily ? "paused" : "lost";
		game.finished_at = daily ? null : Date.now();
		await updateGame(this.db, game);
		log.debug("Gave up active game", {
			chatId,
			gameId: game.id,
			kind: game.kind,
			status: game.status,
			daily,
		});
		if (!daily && game.kind !== "oneshot")
			await recordUsedWord(this.db, chatId, game.answer);
		let tournamentCancelled = false;
		if (game.tournament_id) {
			const t = await getTournament(this.db, game.tournament_id);
			if (t && (t.status === "active" || t.status === "joining")) {
				t.status = "cancelled";
				await updateTournament(this.db, t);
				tournamentCancelled = true;
				log.debug("Cancelled tournament due to give up", {
					chatId,
					tournamentId: t.id,
					gameId: game.id,
				});
			}
		}
		return {
			answer: daily ? null : game.answer,
			language: daily ? null : game.language,
			tournamentCancelled,
			daily,
		};
	}

	async submitGuess(
		chatId: number,
		user: UserRef,
		rawWord: string,
	): Promise<GuessOutcome> {
		const word = rawWord.trim().toLowerCase();
		const game = await getActiveGame(this.db, chatId);
		if (!game) {
			log.debug("Guess ignored without active game", {
				chatId,
				userId: user.id,
				wordLength: word.length,
			});
			return { type: "no_game" };
		}

		// Tournament turn enforcement happens before word validation so out-of-turn
		// players do not learn anything from dictionary or rule checks.
		let tournament: TournamentRow | null = null;
		let currentTournamentPlayer: TournamentPlayer | null = null;
		if (game.kind === "tournament" && game.tournament_id) {
			tournament = await getTournament(this.db, game.tournament_id);
			if (tournament && tournament.status === "active") {
				if (!tournament.players.some((p) => p.userId === user.id)) {
					log.debug("Tournament guess ignored from non-player", {
						chatId,
						gameId: game.id,
						tournamentId: tournament.id,
						userId: user.id,
					});
					return { type: "ignored" };
				}
				const order = roundOrder(tournament.players, tournament.current_round);
				currentTournamentPlayer = order[tournament.turn_idx % order.length];
				if (currentTournamentPlayer.userId !== user.id) {
					log.debug("Tournament guess rejected out of turn", {
						chatId,
						gameId: game.id,
						tournamentId: tournament.id,
						userId: user.id,
						currentUserId: currentTournamentPlayer.userId,
					});
					return {
						type: "not_your_turn",
						currentPlayer: currentTournamentPlayer,
					};
				}
			}
		}

		const settings = await getSettings(this.db, chatId);
		const isOneshot = game.kind === "oneshot";

		const tournamentReject = () =>
			tournament && currentTournamentPlayer
				? this.recordTournamentRejectedAttempt(
						tournament,
						currentTournamentPlayer,
						settings,
					)
				: undefined;

		const wordLength = game.answer.length;
		if (word !== game.answer && !isValidWord(word, game.language, wordLength)) {
			log.debug("Guess rejected as invalid word", {
				chatId,
				gameId: game.id,
				userId: user.id,
				language: game.language,
				wordLength,
			});
			return {
				type: "not_a_word",
				word,
				rejectStatus: await tournamentReject(),
			};
		}
		if (game.guesses.some((g) => g.word === word)) {
			log.debug("Guess rejected as duplicate", {
				chatId,
				gameId: game.id,
				userId: user.id,
				guessNumber: game.guesses.length + 1,
			});
			return { type: "already_guessed", word };
		}

		if (
			!isOneshot &&
			word !== game.answer &&
			(await recentWords(this.db, chatId, settings.creativity)).has(word)
		) {
			log.debug("Guess rejected by creativity filter", {
				chatId,
				gameId: game.id,
				userId: user.id,
			});
			return {
				type: "creativity_blocked",
				word,
				rejectStatus: await tournamentReject(),
			};
		}

		// hard and stricter modes: all revealed hints must be used
		if (!isOneshot && settings.difficulty !== "normal") {
			const superHard =
				settings.difficulty === "superhard" ||
				settings.difficulty === "megahard";
			const megaHard = settings.difficulty === "megahard";
			const violation = hardModeViolation(
				game.answer,
				game.guesses.map((g) => g.word),
				word,
				superHard,
				megaHard,
			);
			if (violation) {
				log.debug("Guess rejected by hard mode", {
					chatId,
					gameId: game.id,
					userId: user.id,
					difficulty: settings.difficulty,
					requiredCount: violation.required.length,
					forbiddenCount: violation.forbidden.length,
				});
				return {
					type: "hard_mode_violation",
					word,
					violation,
					difficulty: settings.difficulty,
					rejectStatus: await tournamentReject(),
				};
			}
		}

		// accept the guess
		const quality = !isOneshot
			? guessQuality(
					game.answer,
					game.guesses.map((g) => g.word),
					word,
					answersForLanguage(game.language, wordLength),
				)
			: undefined;
		const entry: GuessEntry = {
			word,
			userId: user.id,
			userName: user.name,
			ts: Date.now(),
		};
		game.guesses.push(entry);
		const score = scoreGuess(game.answer, word);
		const guessNumber = game.guesses.length;
		const solved = word === game.answer;
		const lost = !solved && guessNumber >= maxGuessesForGame(game);
		logGuessQuality({ chatId, game, user, word, guessNumber, quality });

		if (solved) game.status = "solved";
		if (lost) game.status = "lost";
		if (solved || lost) game.finished_at = Date.now();
		await updateGame(this.db, game);
		log.debug("Guess accepted", {
			chatId,
			gameId: game.id,
			kind: game.kind,
			userId: user.id,
			guessNumber,
			solved,
			lost,
		});

		if (!isOneshot) {
			await recordUsedWord(this.db, chatId, word);
			if (lost) await recordUsedWord(this.db, chatId, game.answer); // revealed answer is burned too
		}

		const outcome: GuessOutcome = {
			type: "accepted",
			game,
			score,
			quality,
			guessNumber,
			solved,
			lost,
		};

		if (!isOneshot) {
			await applyGuessStats(this.db, chatId, user, score, quality!);
			if (solved || lost)
				await applyGameEndStats(this.db, chatId, game, solved, guessNumber);
			if (tournament && tournament.status === "active") {
				outcome.tournament = await this.advanceTournament(
					tournament,
					user,
					solved,
					lost,
					guessNumber,
				);
			}
		}
		return outcome;
	}

	// ---------- tournaments ----------

	async createTournament(
		chatId: number,
		rounds: number,
		creator: UserRef,
		messageThreadId: number | null = null,
	): Promise<TournamentRow | null> {
		if (
			(await getOpenTournament(this.db, chatId)) ||
			(await getActiveGame(this.db, chatId))
		) {
			log.debug("Create tournament blocked", {
				chatId,
				creatorId: creator.id,
				rounds,
			});
			return null;
		}
		const t = await createTournament(
			this.db,
			chatId,
			rounds,
			creator.id,
			messageThreadId,
		);
		t.players = [
			{
				userId: creator.id,
				userName: creator.name,
				username: creator.username,
				firstName: creator.firstName ?? creator.name,
			},
		];
		await updateTournament(this.db, t);
		log.debug("Created tournament lobby", {
			chatId,
			tournamentId: t.id,
			creatorId: creator.id,
			rounds,
		});
		return getTournament(this.db, t.id);
	}

	async joinTournament(
		tournamentId: number,
		user: UserRef,
	): Promise<TournamentRow | "closed" | "already_in" | null> {
		const t = await getTournament(this.db, tournamentId);
		if (!t) return null;
		if (t.status !== "joining") return "closed";
		if (t.players.some((p) => p.userId === user.id)) return "already_in";
		t.players.push({
			userId: user.id,
			userName: user.name,
			username: user.username,
			firstName: user.firstName ?? user.name,
		});
		await updateTournament(this.db, t);
		log.debug("Joined tournament lobby", {
			chatId: t.chat_id,
			tournamentId,
			userId: user.id,
			playerCount: t.players.length,
		});
		return getTournament(this.db, t.id);
	}

	async quitTournament(
		tournamentId: number,
		userId: number,
	): Promise<TournamentRow | "closed" | "not_in" | null> {
		const t = await getTournament(this.db, tournamentId);
		if (!t) return null;
		if (t.status !== "joining") return "closed";
		if (!t.players.some((p) => p.userId === userId)) return "not_in";
		t.players = t.players.filter((p) => p.userId !== userId);
		if (t.players.length === 0) t.status = "cancelled";
		await updateTournament(this.db, t);
		log.debug("Quit tournament lobby", {
			chatId: t.chat_id,
			tournamentId,
			userId,
			status: t.status,
			playerCount: t.players.length,
		});
		return getTournament(this.db, t.id);
	}

	/** Start the tournament: first round game is created. */
	async startTournament(
		tournamentId: number,
	): Promise<
		| { t: TournamentRow; game: GameRow; firstPlayer: TournamentPlayer }
		| "too_few"
		| null
	> {
		const t = await getTournament(this.db, tournamentId);
		if (!t || t.status !== "joining") return null;
		if (t.players.length < 2) {
			log.debug("Start tournament blocked by too few players", {
				chatId: t.chat_id,
				tournamentId,
				playerCount: t.players.length,
			});
			return "too_few";
		}
		if (t.rounds < 1) t.rounds = t.players.length;
		t.status = "active";
		t.current_round = 1;
		t.turn_idx = 0;
		t.fail_count = 0;
		t.turn_started_at = nextTurnStartedAt(t.turn_started_at);
		for (const p of t.players) t.scores[String(p.userId)] = 0;
		await updateTournament(this.db, t);
		const game = await this.newTournamentGame(t);
		log.debug("Started tournament", {
			chatId: t.chat_id,
			tournamentId,
			gameId: game.id,
			rounds: t.rounds,
			playerCount: t.players.length,
		});
		return {
			t: (await getTournament(this.db, t.id))!,
			game,
			firstPlayer: roundOrder(t.players, 1)[0],
		};
	}

	async cancelTournament(
		chatId: number,
		userId: number,
	): Promise<TournamentRow | "not_allowed" | null> {
		const t = await getOpenTournament(this.db, chatId);
		if (!t) return null;
		if (t.created_by !== userId) return "not_allowed";
		t.status = "cancelled";
		await updateTournament(this.db, t);
		log.debug("Cancelled tournament", {
			chatId,
			tournamentId: t.id,
			userId,
		});
		const game = await getActiveGame(this.db, chatId);
		if (game && game.tournament_id === t.id) {
			game.status = "lost";
			game.finished_at = Date.now();
			await updateGame(this.db, game);
			await recordUsedWord(this.db, chatId, game.answer);
		}
		return t;
	}

	async resetActiveTournamentTurnTimer(
		chatId: number,
	): Promise<TournamentRow | null> {
		const t = await getOpenTournament(this.db, chatId);
		if (!t || t.status !== "active") return null;
		t.turn_started_at = nextTurnStartedAt(t.turn_started_at);
		await updateTournament(this.db, t);
		log.debug("Reset tournament turn timer", {
			chatId,
			tournamentId: t.id,
			turnStartedAt: t.turn_started_at,
		});
		return getTournament(this.db, t.id);
	}

	async expireTournamentTurn(
		tournamentId: number,
		turnStartedAt: number,
	): Promise<TournamentTurnExpiredOutcome | null> {
		const t = await getTournament(this.db, tournamentId);
		if (!t || t.status !== "active" || t.turn_started_at !== turnStartedAt)
			return null;

		const game = await getActiveGame(this.db, t.chat_id);
		if (!game || game.kind !== "tournament" || game.tournament_id !== t.id)
			return null;

		const order = roundOrder(t.players, t.current_round);
		const expiredPlayer = order[t.turn_idx % order.length];
		t.turn_idx = (t.turn_idx + 1) % t.players.length;
		t.fail_count = 0;
		t.turn_started_at = nextTurnStartedAt(t.turn_started_at);
		await updateTournament(this.db, t);
		log.warn("Tournament turn expired", {
			chatId: t.chat_id,
			tournamentId: t.id,
			expiredUserId: expiredPlayer.userId,
			round: t.current_round,
			turnStartedAt,
		});

		const updated = (await getTournament(this.db, t.id))!;
		const nextPlayer = roundOrder(updated.players, updated.current_round)[
			updated.turn_idx % updated.players.length
		];
		return { t: updated, expiredPlayer, nextPlayer };
	}

	private async newTournamentGame(t: TournamentRow): Promise<GameRow> {
		const s = await getSettings(this.db, t.chat_id);
		const answer = pickAnswer(
			s.language,
			s.wordLength,
			await recentWords(this.db, t.chat_id, s.creativity),
		);
		const game = await createGame(
			this.db,
			t.chat_id,
			answer,
			s.language,
			"tournament",
			{
				tournamentId: t.id,
			},
		);
		log.debug("Created tournament game", {
			chatId: t.chat_id,
			tournamentId: t.id,
			gameId: game.id,
			round: t.current_round,
			language: game.language,
			wordLength: game.answer.length,
		});
		return game;
	}

	private async recordTournamentRejectedAttempt(
		t: TournamentRow,
		currentPlayer: TournamentPlayer,
		settings: ChatSettings,
	): Promise<TournamentRejectStatus | undefined> {
		const limit = settings.tournamentMaxFails;
		if (limit === null) return undefined;

		t.fail_count += 1;
		if (t.fail_count < limit) {
			await updateTournament(this.db, t);
			log.debug("Recorded tournament rejected guess", {
				chatId: t.chat_id,
				tournamentId: t.id,
				userId: currentPlayer.userId,
				failCount: t.fail_count,
				limit,
			});
			return {
				forfeitedPlayer: currentPlayer,
				failCount: t.fail_count,
				limit,
				remaining: limit - t.fail_count,
			};
		}

		const failCount = t.fail_count;
		t.turn_idx = (t.turn_idx + 1) % t.players.length;
		t.fail_count = 0;
		t.turn_started_at = nextTurnStartedAt(t.turn_started_at);
		await updateTournament(this.db, t);
		const nextPlayer = roundOrder(t.players, t.current_round)[t.turn_idx];
		log.warn("Tournament player forfeited turn after rejected guesses", {
			chatId: t.chat_id,
			tournamentId: t.id,
			userId: currentPlayer.userId,
			failCount,
			limit,
			nextUserId: nextPlayer.userId,
		});
		return {
			forfeitedPlayer: currentPlayer,
			failCount,
			limit,
			remaining: 0,
			forfeit: { t, nextPlayer },
		};
	}

	private async advanceTournament(
		t: TournamentRow,
		user: UserRef,
		solved: boolean,
		lost: boolean,
		guessNumber: number,
	): Promise<
		NonNullable<Extract<GuessOutcome, { type: "accepted" }>["tournament"]>
	> {
		let pointsAwarded = 0;
		const roundEnded = solved || lost;
		let tournamentEnded = false;
		let nextGame: GameRow | null = null;
		let nextPlayer: TournamentPlayer | null = null;
		let winners: TournamentPlayer[] = [];

		t.fail_count = 0;

		if (solved) {
			pointsAwarded = pointsForGuessNumber(guessNumber);
			t.scores[String(user.id)] =
				(t.scores[String(user.id)] ?? 0) + pointsAwarded;
			log.debug("Awarded tournament points", {
				chatId: t.chat_id,
				tournamentId: t.id,
				userId: user.id,
				pointsAwarded,
				guessNumber,
			});
		}

		if (roundEnded) {
			if (t.current_round >= t.rounds) {
				t.status = "done";
				tournamentEnded = true;
				winners = tournamentWinners(t);
				await updateTournament(this.db, t);
				await applyTournamentStats(this.db, t, winners);
				log.debug("Tournament finished", {
					chatId: t.chat_id,
					tournamentId: t.id,
					winnerIds: winners.map((winner) => winner.userId),
				});
			} else {
				t.current_round += 1;
				t.turn_idx = 0;
				t.turn_started_at = nextTurnStartedAt(t.turn_started_at);
				await updateTournament(this.db, t);
				nextGame = await this.newTournamentGame(t);
				nextPlayer = roundOrder(t.players, t.current_round)[0];
				log.debug("Advanced tournament round", {
					chatId: t.chat_id,
					tournamentId: t.id,
					round: t.current_round,
					nextUserId: nextPlayer.userId,
					nextGameId: nextGame.id,
				});
			}
		} else {
			t.turn_idx = (t.turn_idx + 1) % t.players.length;
			t.turn_started_at = nextTurnStartedAt(t.turn_started_at);
			await updateTournament(this.db, t);
			nextPlayer = roundOrder(t.players, t.current_round)[t.turn_idx];
			log.debug("Advanced tournament turn", {
				chatId: t.chat_id,
				tournamentId: t.id,
				round: t.current_round,
				nextUserId: nextPlayer.userId,
			});
		}
		return {
			t,
			pointsAwarded,
			roundEnded,
			tournamentEnded,
			nextGame,
			nextPlayer,
			winners,
		};
	}

	statsFor(chatId: number, userId: number) {
		return getStats(this.db, chatId, userId);
	}

	findStatsByName(chatId: number, query: string) {
		return findStatsByName(this.db, chatId, query);
	}

	globalStatsFor(userId: number) {
		return getGlobalStats(this.db, userId);
	}
}
