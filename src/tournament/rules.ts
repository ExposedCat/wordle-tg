import type { TournamentPlayer, TournamentRow } from "../app/data.ts";
import { MAX_GUESSES } from "../game/guess.ts";

/** Turn order for a given 1-based round: players rotated left by (round - 1). */
export function roundOrder(
	players: TournamentPlayer[],
	round: number,
): TournamentPlayer[] {
	const k = (round - 1) % players.length;
	return [...players.slice(k), ...players.slice(0, k)];
}

export function pointsForGuessNumber(n: number): number {
	return MAX_GUESSES + 1 - n; // guess #1 -> 6 pts ... guess #6 -> 1 pt
}

export function nextTurnStartedAt(previous: number | null): number {
	const now = Date.now();
	return previous === null ? now : Math.max(now, previous + 1);
}

export function tournamentWinners(t: TournamentRow): TournamentPlayer[] {
	const max = Math.max(
		...t.players.map((p) => t.scores[String(p.userId)] ?? 0),
	);
	return t.players.filter((p) => (t.scores[String(p.userId)] ?? 0) === max);
}
