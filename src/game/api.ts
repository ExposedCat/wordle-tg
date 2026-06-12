import type { Database, TournamentRow } from "../db.ts";
import type { WordLanguage } from "../engine/language.ts";
import {
	GameService,
	type OneshotPuzzle,
	type StartDailyGameOutcome,
	type UserRef,
} from "./service.ts";

let service: GameService | null = null;

function game(): GameService {
	if (!service) throw new Error("Game service has not been initialized");
	return service;
}

export function initGame(database: Database): void {
	service = new GameService(database);
}

export const settings = (chatId: number) => game().settings(chatId);

export const saveSettings = (
	chatId: number,
	chatSettings: Awaited<ReturnType<GameService["settings"]>>,
) => game().saveSettings(chatId, chatSettings);

export const setLanguage = (chatId: number, language: WordLanguage) =>
	game().setLanguage(chatId, language);

export const setWordLength = (chatId: number, length: number) =>
	game().setWordLength(chatId, length);

export const setOneshotDifficulty = (
	chatId: number,
	difficulty: Awaited<ReturnType<GameService["settings"]>>["oneshotDifficulty"],
) => game().setOneshotDifficulty(chatId, difficulty);

export const boardMessageIds = (
	chatId: number,
	messageThreadId: number | null,
) => game().boardMessageIds(chatId, messageThreadId);

export const saveBoardMessageIds = (
	chatId: number,
	messageThreadId: number | null,
	messageIds: number[],
) => game().saveBoardMessageIds(chatId, messageThreadId, messageIds);

export const activeGame = (chatId: number) => game().activeGame(chatId);

export const openTournament = (chatId: number) => game().openTournament(chatId);

export const getTournament = (tournamentId: number) =>
	game().getTournament(tournamentId);

export const activeTournaments = () => game().activeTournaments();

export const startGame = (chatId: number) => game().startGame(chatId);

export const startOneshot = (chatId: number): Promise<OneshotPuzzle | null> =>
	game().startOneshot(chatId);

export const activePersonalGame = (chatId: number, userId: number) =>
	game().activePersonalGame(chatId, userId);

export const startPersonalGame = (chatId: number, userId: number) =>
	game().startPersonalGame(chatId, userId);

export const startDailyGame = (
	chatId: number,
): Promise<StartDailyGameOutcome> => game().startDailyGame(chatId);

export const giveUp = (chatId: number) => game().giveUp(chatId);

export const submitGuess = (chatId: number, user: UserRef, rawWord: string) =>
	game().submitGuess(chatId, user, rawWord);

export const createTournament = (
	chatId: number,
	rounds: number,
	creator: UserRef,
	messageThreadId: number | null = null,
) => game().createTournament(chatId, rounds, creator, messageThreadId);

export const joinTournament = (tournamentId: number, user: UserRef) =>
	game().joinTournament(tournamentId, user);

export const quitTournament = (tournamentId: number, userId: number) =>
	game().quitTournament(tournamentId, userId);

export const startTournament = (tournamentId: number) =>
	game().startTournament(tournamentId);

export const resetActiveTournamentTurnTimer = (chatId: number) =>
	game().resetActiveTournamentTurnTimer(chatId);

export const expireTournamentTurn = (
	tournamentId: number,
	turnStartedAt: number,
) => game().expireTournamentTurn(tournamentId, turnStartedAt);

export const createDuel = (
	chatId: number,
	challenger: UserRef,
	messageThreadId: number | null = null,
) => game().createDuel(chatId, challenger, messageThreadId);

export const acceptDuel = (
	duelId: number,
	privateChatId: number,
	user: UserRef,
) => game().acceptDuel(duelId, privateChatId, user);

export const duelWinner = (duel: Parameters<GameService["duelWinner"]>[0]) =>
	game().duelWinner(duel);

export const statsFor = (chatId: number, userId: number) =>
	game().statsFor(chatId, userId);

export const findStatsByName = (chatId: number, query: string) =>
	game().findStatsByName(chatId, query);

export const globalStatsFor = (userId: number) => game().globalStatsFor(userId);

export const scheduleActiveTournamentTimers = async (
	schedule: (tournament: TournamentRow) => void,
): Promise<void> => {
	for (const tournament of await activeTournaments()) schedule(tournament);
};
