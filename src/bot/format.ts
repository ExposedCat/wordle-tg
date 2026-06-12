import type { TranslateFunction } from "@grammyjs/i18n";
import type {
	ChatSettings,
	Difficulty,
	OneshotDifficulty,
	StatsRow,
	TournamentRow,
} from "../db.ts";
import type { HardModeViolation } from "../engine/hardmode.ts";
import { DEFAULT_WORD_LENGTH, LANGUAGE_LABELS } from "../engine/language.ts";
import { scoreGuess, type TileStatus } from "../engine/score.ts";
import { roundOrder } from "../game/service.ts";
import {
	type EmojiPackConfig,
	escapeHtml,
	formatTileLetter,
	type TileColor,
} from "../render/emoji-pack.ts";
import { text as defaultText } from "./i18n.ts";
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
	normal: defaultText("partial.difficultyNormal"),
	hard: defaultText("partial.difficultyHard"),
	superhard: defaultText("partial.difficultySuperhard"),
};

export const ONESHOT_DIFFICULTY_LABEL: Record<OneshotDifficulty, string> = {
	easy: defaultText("partial.oneshotEasy"),
	normal: defaultText("partial.oneshotNormal"),
	hard: defaultText("partial.oneshotHard"),
	expert: defaultText("partial.oneshotExpert"),
};

const STATS_BAR_FILL = "■";
const STATS_BAR_END = "◗";

export function rankLabelHtml(rank: number): string {
	switch (rank) {
		case 1:
			return '<tg-emoji emoji-id="5794182096603847292">1️⃣</tg-emoji>';
		case 2:
			return '<tg-emoji emoji-id="5794303034292968945">2️⃣</tg-emoji>';
		case 3:
			return '<tg-emoji emoji-id="5794031944547178894">3️⃣</tg-emoji>';
		case 4:
			return '<tg-emoji emoji-id="5793901252987330401">4️⃣</tg-emoji>';
		case 5:
			return '<tg-emoji emoji-id="5794066823976592976">5️⃣</tg-emoji>';
		case 6:
			return '<tg-emoji emoji-id="5794235255414069703">6️⃣</tg-emoji>';
		default:
			return `${rank}.`;
	}
}

function onOff(translate: TranslateFunction, enabled: boolean): string {
	return translate(enabled ? "partial.on" : "partial.off");
}

function creativityValue(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	if (!chatSettings.creativity.configured || !chatSettings.creativity.enabled)
		return translate("partial.off");
	return chatSettings.creativity.mode === "time"
		? translate("format.creativityValueTime", {
				duration: humanDuration(chatSettings.creativity.seconds),
			})
		: translate("format.creativityValueCount", {
				count: chatSettings.creativity.count,
			});
}

function oneshotPatternText(
	green: number,
	yellow: number,
	emojiPack: EmojiPackConfig | null,
): string {
	const parts: string[] = [];
	if (green > 0)
		parts.push(`${formatTileLetter("A", "green", emojiPack)} ${green}`);
	if (yellow > 0)
		parts.push(`${formatTileLetter("A", "yellow", emojiPack)} ${yellow}`);
	return parts.join(" + ");
}

function rejectedGuessesValue(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	return chatSettings.tournamentMaxFails === null
		? translate("partial.off")
		: `${chatSettings.tournamentMaxFails}`;
}

function timerValue(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	return chatSettings.tournamentTurnSeconds === null
		? translate("partial.off")
		: humanTurnTime(chatSettings.tournamentTurnSeconds);
}

function emojiPackValue(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	return chatSettings.emojiPack?.name ?? translate("partial.off");
}

export function helpText(
	translate: TranslateFunction,
	_chatSettings: ChatSettings,
): string {
	return translate("help.main", {
		sourceCode: translate("format.sourceCode"),
	});
}

export function describeCreativity(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	if (!chatSettings.creativity.configured)
		return translate("format.creativityUnset");
	if (!chatSettings.creativity.enabled)
		return translate("format.creativityOff");
	return chatSettings.creativity.mode === "time"
		? translate("format.creativityTime", {
				duration: humanDuration(chatSettings.creativity.seconds),
			})
		: translate("format.creativityCount", {
				count: chatSettings.creativity.count,
			});
}

export function wordleHelpText(): string {
	return defaultText("help.wordle");
}

export function oneshotHelpText(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	return translate("help.oneshot", {
		difficulty: ONESHOT_DIFFICULTY_LABEL[chatSettings.oneshotDifficulty],
		easyTick: lineTick(chatSettings.oneshotDifficulty === "easy"),
		normalTick: lineTick(chatSettings.oneshotDifficulty === "normal"),
		hardTick: lineTick(chatSettings.oneshotDifficulty === "hard"),
		expertTick: lineTick(chatSettings.oneshotDifficulty === "expert"),
		easyPattern: oneshotPatternText(2, 1, chatSettings.emojiPack),
		normalPattern: oneshotPatternText(1, 2, chatSettings.emojiPack),
		hardPattern: oneshotPatternText(1, 1, chatSettings.emojiPack),
		expertPattern: oneshotPatternText(0, 2, chatSettings.emojiPack),
	});
}

export function modeHelpText(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	return translate("help.mode", {
		normalTick: tick(chatSettings.difficulty === "normal"),
		hardTick: tick(chatSettings.difficulty === "hard"),
		superhardTick: tick(chatSettings.difficulty === "superhard"),
	});
}

export function hardModeViolationText(
	translate: TranslateFunction,
	violation: HardModeViolation,
	superHard: boolean,
	emojiPack: EmojiPackConfig | null,
): string {
	const mode = superHard
		? translate("partial.superhard")
		: translate("partial.hard");
	const required = violation.required
		.map((hint) => formatTileLetter(hint.letter, hint.color, emojiPack))
		.join(" ");
	const forbidden = violation.forbidden
		.map((letter) => formatTileLetter(letter, "dark-gray", emojiPack))
		.join(" ");

	if (required && forbidden)
		return translate("format.hardModeBoth", { mode, required, forbidden });
	if (required) return translate("format.hardModeRequired", { mode, required });
	return translate("format.hardModeForbidden", { mode, forbidden });
}

export function alreadyGuessedText(
	translate: TranslateFunction,
	word: string,
	answer: string,
	emojiPack: EmojiPackConfig | null,
): string {
	const tiles = scoreGuess(answer, word)
		.map((status, index) =>
			formatTileLetter(word[index], tileStatusColor(status), emojiPack),
		)
		.join(" ");

	return translate("format.alreadyGuessed", { tiles });
}

export function wordMeaningSuffix(meaning?: string): string {
	return meaning ? defaultText("format.wordMeaningSuffix", { meaning }) : "";
}

export function answerMeaningText(answer: string, meaning?: string): string {
	return defaultText("format.answerMeaning", {
		answer: answer.toUpperCase(),
		meaning: wordMeaningSuffix(meaning),
	});
}

export function answerMeaningSentence(
	answer: string,
	meaning?: string,
): string {
	const suffix = meaning && /[.!?]$/.test(meaning.trim()) ? "" : ".";
	return `${answerMeaningText(answer, meaning)}${suffix}`;
}

export function giveUpText(
	translate: TranslateFunction,
	answer: string,
	meaning?: string,
): string {
	return translate("format.gameOver", {
		answer: answerMeaningSentence(answer, meaning),
	});
}

export function creativityHelpText(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	return translate("help.creativity", {
		value: creativityValue(translate, chatSettings),
		toggleIcon: toggleIcon(chatSettings.creativity.enabled),
		timeValue:
			chatSettings.creativity.configured &&
			chatSettings.creativity.mode === "time"
				? humanDuration(chatSettings.creativity.seconds)
				: translate("partial.timeFrame"),
		timeTick: tick(
			chatSettings.creativity.configured &&
				chatSettings.creativity.mode === "time",
		),
		wordValue:
			chatSettings.creativity.configured &&
			chatSettings.creativity.mode === "count"
				? translate("format.creativityValueCount", {
						count: chatSettings.creativity.count,
					})
				: translate("partial.wordFrame"),
		wordTick: tick(
			chatSettings.creativity.configured &&
				chatSettings.creativity.mode === "count",
		),
	});
}

export function multiplayerHelpText(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	return translate("help.multiplayer", {
		rejectedGuesses: rejectedGuessesValue(translate, chatSettings),
		timer: timerValue(translate, chatSettings),
	});
}

export function statsHelpText(translate: TranslateFunction): string {
	return translate("help.stats");
}

export function preferencesHelpText(
	translate: TranslateFunction,
	chatSettings: ChatSettings,
): string {
	return translate("help.preferences", {
		language: LANGUAGE_LABELS[chatSettings.language],
		length: chatSettings.wordLength,
		auto: onOff(translate, chatSettings.bareWord),
		cleanup: onOff(translate, chatSettings.cleanup),
		roast: onOff(translate, chatSettings.roast),
		emojiPack: emojiPackValue(translate, chatSettings),
	});
}

function tick(enabled: boolean): string {
	return enabled
		? ' <tg-emoji emoji-id="5825794181183836432">✅</tg-emoji>'
		: "";
}

function lineTick(enabled: boolean): string {
	return enabled
		? '<tg-emoji emoji-id="5825794181183836432">✅</tg-emoji> '
		: "";
}

function toggleIcon(enabled: boolean): string {
	return enabled
		? '<tg-emoji emoji-id="5825794181183836432">✅</tg-emoji>'
		: '<tg-emoji emoji-id="5872829476143894491">🚫</tg-emoji>';
}

function tileStatusColor(status: TileStatus): TileColor {
	if (status === "correct") return "green";
	if (status === "present") return "yellow";
	return "dark-gray";
}

export function humanDuration(seconds: number): string {
	if (seconds % 86400 === 0 && seconds >= 86400) return `${seconds / 86400}d`;
	if (seconds % 3600 === 0 && seconds >= 3600) return `${seconds / 3600}h`;
	if (seconds % 60 === 0 && seconds >= 60) return `${seconds / 60}m`;
	return `${seconds}s`;
}

export function humanTurnTime(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return remainingSeconds === 0
		? `${minutes}m`
		: `${minutes}m ${remainingSeconds}s`;
}

export function parseTournamentTimerValue(input: string): number | null {
	const time = input
		.trim()
		.toLowerCase()
		.match(/^(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?)$/);
	if (!time) return null;
	const parsedAmount = parseInt(time[1], 10);
	if (parsedAmount <= 0) return null;
	return time[2][0] === "m" ? parsedAmount * 60 : parsedAmount;
}

/** Parse "30m", "2h", "90s", "1d" → seconds; or "15w" / "15 words" → word count. */
export function parseCreativityValue(
	input: string,
): { seconds: number } | { count: number } | null {
	const trimmed = input.trim().toLowerCase();
	const words = trimmed.match(/^(\d+)\s*(words?|w)$/);
	if (words) {
		const parsedCount = parseInt(words[1], 10);
		return parsedCount > 0 ? { count: parsedCount } : null;
	}
	const time = trimmed.match(
		/^(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)$/,
	);
	if (time) {
		const parsedAmount = parseInt(time[1], 10);
		if (parsedAmount <= 0) return null;
		const unit = time[2][0];
		const multiplier =
			unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
		return { seconds: parsedAmount * multiplier };
	}
	return null;
}

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

export function humanMs(ms: number): string {
	const roundedSeconds = Math.round(ms / 1000);
	if (roundedSeconds < 60) return `${roundedSeconds}s`;
	const minutes = Math.floor(roundedSeconds / 60);
	return `${minutes}m ${roundedSeconds % 60}s`;
}

export function standingsText(tournament: TournamentRow): string {
	const rows = [...tournament.players]
		.map((player) => ({
			player,
			points: tournament.scores[String(player.userId)] ?? 0,
		}))
		.sort((left, right) => right.points - left.points)
		.map((standing, index) =>
			defaultText("format.standingsPoints", {
				rank: rankLabelHtml(index + 1),
				player: standing.player.userName,
				points: standing.points,
			}),
		);
	return rows.join("\n");
}

export function turnOrderText(tournament: TournamentRow): string {
	return roundOrder(tournament.players, tournament.current_round)
		.map((player) => player.userName)
		.join(" → ");
}
