import type { GameRow } from "../app/data.ts";

export const MAX_GUESSES = 6;

export function maxGuessesForGame(game: GameRow): number {
	return game.kind === "oneshot" ? 2 : MAX_GUESSES;
}
