import type { DuelPlayerResult, DuelRow } from "../app/data.ts";

/** Lower guess count wins (must have solved); tie on guesses -> faster time wins; full tie -> draw. */
export function duelWinner(d: DuelRow): DuelPlayerResult | "draw" | null {
	if (
		!d.opponent ||
		d.challenger.guesses === null ||
		d.opponent.guesses === null
	)
		return null;
	const a = d.challenger;
	const b = d.opponent;
	if (a.solved && !b.solved) return a;
	if (b.solved && !a.solved) return b;
	if (!a.solved && !b.solved) return "draw";
	if (a.guesses! !== b.guesses!) return a.guesses! < b.guesses! ? a : b;
	if (a.ms! !== b.ms!) return a.ms! < b.ms! ? a : b;
	return "draw";
}
