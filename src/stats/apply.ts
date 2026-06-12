import {
	bumpStats,
	type Database,
	type DuelRow,
	type GameRow,
	getStats,
	type TournamentPlayer,
	type TournamentRow,
} from "../app/data.ts";
import { duelWinner } from "../game/duel.ts";
import type { GuessQuality } from "../game/guess-quality.ts";
import type { TileStatus } from "../game/score.ts";

type StatsUserRef = {
	id: number;
	name: string;
};

export async function applyGuessStats(
	db: Database,
	chatId: number,
	user: StatsUserRef,
	score: TileStatus[],
	quality: GuessQuality,
): Promise<void> {
	await bumpStats(db, chatId, user.id, user.name, {
		guesses_total: 1,
		guess_quality_count: quality.possibleCount > 0 ? 1 : 0,
		guess_expected_remaining_sum: quality.actualRemaining,
		guess_quality_points_sum: quality.points,
		greens: score.filter((s) => s === "correct").length,
		yellows: score.filter((s) => s === "present").length,
	});
}

export async function applyGameEndStats(
	db: Database,
	chatId: number,
	game: GameRow,
	solved: boolean,
	guessNumber: number,
): Promise<void> {
	const participants = new Map<number, string>();
	for (const g of game.guesses) participants.set(g.userId, g.userName);
	const solver = solved ? game.guesses[game.guesses.length - 1] : null;

	for (const [userId, name] of participants) {
		const prev = (await getStats(db, chatId, userId)).current_streak;
		await bumpStats(
			db,
			chatId,
			userId,
			name,
			{ games_played: 1, games_won: solved ? 1 : 0 },
			{ setCurrentStreak: solved ? prev + 1 : 0 },
		);
	}
	if (solver) {
		const distKey = `dist${guessNumber}` as "dist1";
		await bumpStats(
			db,
			chatId,
			solver.userId,
			solver.userName,
			{ solves: 1, [distKey]: 1 },
			{ fastestMs: (game.finished_at ?? Date.now()) - game.started_at },
		);
	}
}

export async function applyTournamentStats(
	db: Database,
	t: TournamentRow,
	winners: TournamentPlayer[],
): Promise<void> {
	for (const p of t.players) {
		await bumpStats(db, t.chat_id, p.userId, p.userName, {
			tournaments_played: 1,
			tournaments_won: winners.some((w) => w.userId === p.userId) ? 1 : 0,
			tournament_points: t.scores[String(p.userId)] ?? 0,
		});
	}
}

export async function applyDuelStats(db: Database, d: DuelRow): Promise<void> {
	const winner = duelWinner(d);
	for (const p of [d.challenger, d.opponent!]) {
		await bumpStats(db, d.chat_id, p.userId, p.userName, {
			duels_played: 1,
			duels_won: winner !== "draw" && winner?.userId === p.userId ? 1 : 0,
		});
	}
}
