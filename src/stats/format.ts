import type { TranslateFunction } from "@grammyjs/i18n";
import type { StatsRow } from "../app/data.ts";
import { text as defaultText } from "../bot/i18n.ts";
import { rankLabelHtml } from "../bot/rank.ts";
import { escapeHtml } from "../game/emoji-pack.ts";
import { DEFAULT_WORD_LENGTH } from "../game/language.ts";

const STATS_BAR_FILL = "■";
const STATS_BAR_END = "◗";

function percent(part: number, total: number): number {
	return total ? Math.round((100 * part) / total) : 0;
}

function avgLeftText(statistics: StatsRow): string {
	if (!statistics.guess_quality_count) return defaultText("partial.na");
	const avg =
		Math.round(
			(statistics.guess_expected_remaining_sum /
				statistics.guess_quality_count) *
				10,
		) / 10;
	return avg.toString();
}

function qualityScoreText(statistics: StatsRow): string {
	if (!statistics.guess_quality_count) return defaultText("partial.na");
	return Math.round(
		statistics.guess_quality_points_sum / statistics.guess_quality_count,
	).toString();
}

function winningBar(count: number, maxCount: number): string {
	if (!count || !maxCount) return "";
	const units = Math.max(1, Math.round((count / maxCount) * 5));
	return `${STATS_BAR_FILL.repeat(Math.min(5, units))}${STATS_BAR_END}`;
}

function winningLine(label: string, count: number, maxCount: number): string {
	const bar = winningBar(count, maxCount);
	return bar ? `${label} ${bar}` : `${label}`;
}

export function statsText(
	translate: TranslateFunction,
	statistics: StatsRow,
	displayName: string,
	chatName: string,
): string {
	const totalLetters = statistics.guesses_total * DEFAULT_WORD_LENGTH;
	const maxDist = Math.max(
		statistics.dist1,
		statistics.dist2,
		statistics.dist3,
		statistics.dist4,
		statistics.dist5,
		statistics.dist6,
	);

	return translate("format.stats", {
		displayName: escapeHtml(displayName),
		chatName: escapeHtml(chatName),
		gamesPlayed: statistics.games_played,
		gamesWon: statistics.games_won,
		gamesWonPercent: percent(statistics.games_won, statistics.games_played),
		solves: statistics.solves,
		solvesPlayedPercent: percent(statistics.solves, statistics.games_played),
		solvesWonPercent: percent(statistics.solves, statistics.games_won),
		currentStreak: statistics.current_streak,
		bestStreak: statistics.best_streak,
		guessesTotal: statistics.guesses_total,
		yellows: statistics.yellows,
		yellowsGuessPercent: percent(statistics.yellows, statistics.guesses_total),
		yellowsLetterPercent: percent(statistics.yellows, totalLetters),
		greens: statistics.greens,
		greensGuessPercent: percent(statistics.greens, statistics.guesses_total),
		greensLetterPercent: percent(statistics.greens, totalLetters),
		qualityScore: qualityScoreText(statistics),
		avgLeft: avgLeftText(statistics),
		dist1: winningLine(rankLabelHtml(1), statistics.dist1, maxDist),
		dist2: winningLine(rankLabelHtml(2), statistics.dist2, maxDist),
		dist3: winningLine(rankLabelHtml(3), statistics.dist3, maxDist),
		dist4: winningLine(rankLabelHtml(4), statistics.dist4, maxDist),
		dist5: winningLine(rankLabelHtml(5), statistics.dist5, maxDist),
		dist6: winningLine(rankLabelHtml(6), statistics.dist6, maxDist),
		tournamentsPlayed: statistics.tournaments_played,
		tournamentsWon: statistics.tournaments_won,
		tournamentsWonPercent: percent(
			statistics.tournaments_won,
			statistics.tournaments_played,
		),
		tournamentPoints: statistics.tournament_points,
		duelsPlayed: statistics.duels_played,
		duelsWon: statistics.duels_won,
		duelsWonPercent: percent(statistics.duels_won, statistics.duels_played),
	});
}
