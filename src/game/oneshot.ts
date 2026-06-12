import type { OneshotDifficulty } from "../app/data.ts";
import { scoreGuess, type TileStatus } from "./score.ts";

export interface OneshotPuzzleSeed {
	mode: OneshotDifficulty;
	opener: string;
	answer: string;
	score: TileStatus[];
}

const ONESHOT_TARGETS: Record<
	OneshotDifficulty,
	{ correct: number; present: number }
> = {
	easy: { correct: 2, present: 1 },
	normal: { correct: 1, present: 2 },
	hard: { correct: 1, present: 1 },
	expert: { correct: 0, present: 2 },
};

function randomItem<T>(items: readonly T[]): T {
	return items[Math.floor(Math.random() * items.length)];
}

function shuffled<T>(items: readonly T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

function scoreMatchesTarget(
	score: TileStatus[],
	target: { correct: number; present: number },
): boolean {
	return (
		score.filter((s) => s === "correct").length === target.correct &&
		score.filter((s) => s === "present").length === target.present
	);
}

export function impossibleOneshotTarget(
	length: number,
	difficulty: OneshotDifficulty,
): boolean {
	const target = ONESHOT_TARGETS[difficulty];
	if (target.correct + target.present > length) return true;
	return target.correct === length - 1 && target.present > 0;
}

export function buildOneshotPuzzle(
	words: readonly string[],
	difficulty: OneshotDifficulty,
): OneshotPuzzleSeed | null {
	const target = ONESHOT_TARGETS[difficulty];
	for (const opener of shuffled(words)) {
		const candidates = words.filter(
			(answer) =>
				answer !== opener &&
				scoreMatchesTarget(scoreGuess(answer, opener), target),
		);
		if (!candidates.length) continue;

		const answer = randomItem(candidates);
		return {
			mode: difficulty,
			opener,
			answer,
			score: scoreGuess(answer, opener),
		};
	}
	return null;
}
