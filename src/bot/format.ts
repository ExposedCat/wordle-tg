import type { TranslateFunction } from "@grammyjs/i18n";
import type {
	ChatSettings,
	Difficulty,
	OneshotDifficulty,
} from "../app/data.ts";
import {
	type EmojiPackConfig,
	formatTileLetter,
	type TileColor,
} from "../game/emoji-pack.ts";
import type { HardModeViolation } from "../game/hardmode.ts";
import { LANGUAGE_LABELS } from "../game/language.ts";
import { scoreGuess, type TileStatus } from "../game/score.ts";
import { text as defaultText } from "./i18n.ts";

export { statsText } from "../stats/format.ts";
export { standingsText, turnOrderText } from "../tournament/format.ts";
export { rankLabelHtml } from "./rank.ts";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
	normal: defaultText("partial.difficultyNormal"),
	hard: defaultText("partial.difficultyHard"),
	superhard: defaultText("partial.difficultySuperhard"),
	megahard: defaultText("partial.difficultyMegahard"),
};

export const ONESHOT_DIFFICULTY_LABEL: Record<OneshotDifficulty, string> = {
	easy: defaultText("partial.oneshotEasy"),
	normal: defaultText("partial.oneshotNormal"),
	hard: defaultText("partial.oneshotHard"),
	expert: defaultText("partial.oneshotExpert"),
};

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
		megahardTick: tick(chatSettings.difficulty === "megahard"),
	});
}

export function hardModeViolationText(
	translate: TranslateFunction,
	violation: HardModeViolation,
	difficulty: Difficulty,
	emojiPack: EmojiPackConfig | null,
): string {
	const mode =
		difficulty === "megahard"
			? translate("partial.megahard")
			: difficulty === "superhard"
				? translate("partial.superhard")
				: translate("partial.hard");
	const required = violation.required
		.map((hint) => formatTileLetter(hint.letter, hint.color, emojiPack))
		.join(" ");
	const forbidden = violation.forbidden
		.map((letter) => formatTileLetter(letter, "dark-gray", emojiPack))
		.join(" ");
	const misplaced = violation.misplaced
		.map((hint) => formatTileLetter(hint.letter, hint.color, emojiPack))
		.join(" ");
	const misplacedSuffix = misplaced
		? `\n${translate("format.hardModeMisplacedSuffix", { misplaced })}`
		: "";

	if (required && forbidden)
		return `${translate("format.hardModeBoth", { mode, required, forbidden })}${misplacedSuffix}`;
	if (required)
		return `${translate("format.hardModeRequired", { mode, required })}${misplacedSuffix}`;
	if (forbidden)
		return `${translate("format.hardModeForbidden", { mode, forbidden })}${misplacedSuffix}`;
	return translate("format.hardModeMisplaced", { mode, misplaced });
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

export function humanMs(ms: number): string {
	const roundedSeconds = Math.round(ms / 1000);
	if (roundedSeconds < 60) return `${roundedSeconds}s`;
	const minutes = Math.floor(roundedSeconds / 60);
	return `${minutes}m ${roundedSeconds % 60}s`;
}
