import { ChatSettings, Difficulty, StatsRow, TournamentRow } from '../db.js';
import type { HardModeViolation } from '../engine/hardmode.js';
import { LANGUAGE_LABELS } from '../engine/language.js';
import { scoreGuess, type TileStatus } from '../engine/score.js';
import { roundOrder } from '../game/service.js';
import { escapeHtml, formatTileLetter, type EmojiPackConfig, type TileColor } from '../render/emoji-pack.js';

export const HELP_TEXT = `<tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> Wordle

/play · start a new game
/tournament [N] · start a tournament
/w [WORD] · guess a word
/board · see current game board
/en /ru · select word language

<tg-emoji emoji-id="5879813604068298387">❗</tg-emoji> See /settings for cool modes and preferences!

<tg-emoji emoji-id="5884343982816759327">↗️</tg-emoji> <a href="https://github.com/ExposedCat/telewordle">Source Code</a> (forked <a href="https://github.com/Argotoss/telewordle">telewordle</a>)`;

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  normal: '😎 normal',
  hard: '😤 hard',
  superhard: '🔥 super hard',
};

const TICK = '<tg-emoji emoji-id="5825794181183836432">✅</tg-emoji>';
const FORBIDDEN = '<tg-emoji emoji-id="5872829476143894491">🚫</tg-emoji>';
const A_YELLOW = '<tg-emoji emoji-id="5280718893806034581">🔠</tg-emoji>';
const A_GREEN = '<tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji>';
const A_DARK = '<tg-emoji emoji-id="5282737683053980256">🔠</tg-emoji>';
const GAME_OVER = '<tg-emoji emoji-id="5927054181285237634">🏳️</tg-emoji>';
const STATS_USER = '<tg-emoji emoji-id="5778575233422200567">👤</tg-emoji>';
const STATS_GAMES = '<tg-emoji emoji-id="6008090211181923982">🎮</tg-emoji>';
const STATS_GUESSES = '<tg-emoji emoji-id="6005695599410679642">🔠</tg-emoji>';
const STATS_WINNING = '<tg-emoji emoji-id="6008135256798927387">🏆</tg-emoji>';
const STATS_TOURNAMENTS = '<tg-emoji emoji-id="5942877472163892475">👥</tg-emoji>';
const STATS_DUELS = '<tg-emoji emoji-id="5944940516754853337">⚔️</tg-emoji>';
const STATS_BAR_FILL = '■';
const STATS_BAR_END = '◗';
const NUMBER_LABELS = [
  '<tg-emoji emoji-id="5794182096603847292">1️⃣</tg-emoji>',
  '<tg-emoji emoji-id="5794303034292968945">2️⃣</tg-emoji>',
  '<tg-emoji emoji-id="5794031944547178894">3️⃣</tg-emoji>',
  '<tg-emoji emoji-id="5793901252987330401">4️⃣</tg-emoji>',
  '<tg-emoji emoji-id="5794066823976592976">5️⃣</tg-emoji>',
  '<tg-emoji emoji-id="5794235255414069703">6️⃣</tg-emoji>',
];

export function rankLabelHtml(rank: number): string {
  return NUMBER_LABELS[rank - 1] ?? `${rank}.`;
}

export function describeCreativity(s: ChatSettings): string {
  if (!s.creativity.configured) return 'off — set with /creativity 30m or /creativity 15w';
  if (!s.creativity.enabled) return 'off';
  return s.creativity.mode === 'time'
    ? `on — words from the last ${humanDuration(s.creativity.seconds)} are banned`
    : `on — the last ${s.creativity.count} words are banned`;
}

export function settingsText(s: ChatSettings): string {
  return `Language
/en · English${tick(s.language === 'en')}
/ru · Russian${tick(s.language === 'ru')}

Mode /mode_help
/normal · normal mode${tick(s.difficulty === 'normal')}
/hard · hard mode${tick(s.difficulty === 'hard')}
/superhard · super hard mode${tick(s.difficulty === 'superhard')}

Creativity /creativity_help
/creativity · toggle creativity ${toggleIcon(s.creativity.enabled)}
/creativity 30m · time frame${tick(s.creativity.configured && s.creativity.mode === 'time')}
/creativity 15w · word frame${tick(s.creativity.configured && s.creativity.mode === 'count')}

Tournament
/fails N · max rejected guesses per turn: ${s.tournamentMaxFails === null ? 'off' : s.tournamentMaxFails}
/fails off · unlimited

Misc
/auto · guess without /w ${toggleIcon(s.bareWord)}
/cleanup · remove old boards ${toggleIcon(s.cleanup)}
/usepack NAME · custom emoji pack ${toggleIcon(s.emojiPack !== null)}

Current language: ${LANGUAGE_LABELS[s.language]}`;
}

export function modeHelpText(s: ChatSettings): string {
  return `Normal /normal${tick(s.difficulty === 'normal')}
Classic Wordle experience.

Hard /hard${tick(s.difficulty === 'hard')}
Each guess must use ${A_YELLOW} yellow and ${A_GREEN} green hints from previous guesses.

Super-hard /superhard${tick(s.difficulty === 'superhard')}
Hard, but ${A_DARK} dark hints cannot be used.`;
}

export function hardModeViolationText(
  violation: HardModeViolation,
  superHard: boolean,
  emojiPack: EmojiPackConfig | null
): string {
  const mode = superHard ? 'Super-hard' : 'Hard';
  const required = violation.required
    .map((hint) => formatTileLetter(hint.letter, hint.color, emojiPack))
    .join(' ');
  const forbidden = violation.forbidden.map((letter) => formatTileLetter(letter, 'dark-gray', emojiPack)).join(' ');

  if (required && forbidden) return `${mode}: you must use ${required}.\nYou cannot use ${forbidden}`;
  if (required) return `${mode}: you must use ${required}`;
  return `${mode}: you cannot use ${forbidden}`;
}

export function alreadyGuessedText(word: string, answer: string, emojiPack: EmojiPackConfig | null): string {
  const tiles = scoreGuess(answer, word)
    .map((status, index) => formatTileLetter(word[index], tileStatusColor(status), emojiPack))
    .join(' ');

  return `${tiles} was already guessed`;
}

export function giveUpText(answer: string): string {
  return `${GAME_OVER} Game Over! The word was ${answer.toUpperCase()}.`;
}

export function creativityHelpText(s: ChatSettings): string {
  return `Toggle /creativity ${toggleIcon(s.creativity.enabled)}
Turns creativity on or off using the saved frame.

Time frame /creativity 30m${tick(s.creativity.configured && s.creativity.mode === 'time')}
Bans words used within a time window. Supports s, m, h, d.

Word frame /creativity 15w${tick(s.creativity.configured && s.creativity.mode === 'count')}
Bans the last N used words.`;
}

function tick(enabled: boolean): string {
  return enabled ? ` ${TICK}` : '';
}

function toggleIcon(enabled: boolean): string {
  return enabled ? TICK : FORBIDDEN;
}

function tileStatusColor(status: TileStatus): TileColor {
  if (status === 'correct') return 'green';
  if (status === 'present') return 'yellow';
  return 'dark-gray';
}

export function humanDuration(seconds: number): string {
  if (seconds % 86400 === 0 && seconds >= 86400) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0 && seconds >= 3600) return `${seconds / 3600}h`;
  if (seconds % 60 === 0 && seconds >= 60) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/** Parse "30m", "2h", "90s", "1d" → seconds; or "15w" / "15 words" → word count. */
export function parseCreativityValue(input: string): { seconds: number } | { count: number } | null {
  const trimmed = input.trim().toLowerCase();
  const words = trimmed.match(/^(\d+)\s*(words?|w)$/);
  if (words) {
    const n = parseInt(words[1], 10);
    return n > 0 ? { count: n } : null;
  }
  const time = trimmed.match(/^(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)$/);
  if (time) {
    const n = parseInt(time[1], 10);
    if (n <= 0) return null;
    const unit = time[2][0];
    const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return { seconds: n * mult };
  }
  return null;
}

function percent(part: number, total: number): number {
  return total ? Math.round((100 * part) / total) : 0;
}

function avgLeftText(s: StatsRow): string {
  if (!s.guess_quality_count) return 'n/a';
  const avg = Math.round((s.guess_expected_remaining_sum / s.guess_quality_count) * 10) / 10;
  return avg.toString();
}

function qualityScoreText(s: StatsRow): string {
  if (!s.guess_quality_count) return 'n/a';
  return Math.round(s.guess_quality_points_sum / s.guess_quality_count).toString();
}

function winningBar(count: number, maxCount: number): string {
  if (!count || !maxCount) return '';
  const units = Math.max(1, Math.round((count / maxCount) * 5));
  return `${STATS_BAR_FILL.repeat(Math.min(5, units))}${STATS_BAR_END}`;
}

function winningLine(label: string, count: number, maxCount: number): string {
  const bar = winningBar(count, maxCount);
  return bar ? `${label} ${bar}` : `${label}`;
}

export function statsText(s: StatsRow, displayName: string, chatName: string): string {
  const totalLetters = s.guesses_total * 5;
  const maxDist = Math.max(s.dist1, s.dist2, s.dist3, s.dist4, s.dist5, s.dist6);

  return `${STATS_USER} ${escapeHtml(displayName)} · ${escapeHtml(chatName)}

${STATS_GAMES} Games
${s.games_played} total · ${s.games_won} won (${percent(s.games_won, s.games_played)}%) · ${s.solves} finished (${percent(s.solves, s.games_played)}% / ${percent(s.solves, s.games_won)}%)
${s.current_streak} in a row · max ${s.best_streak}

${STATS_GUESSES} Guesses
${s.guesses_total} guesses · ${A_YELLOW} ${s.yellows} (${percent(s.yellows, s.guesses_total)}% / ${percent(s.yellows, totalLetters)}%) · ${A_GREEN} ${s.greens} (${percent(s.greens, s.guesses_total)}% / ${percent(s.greens, totalLetters)}%)
${qualityScoreText(s)}/100 quality score · ${avgLeftText(s)} words left on average

${STATS_WINNING} Winning
${winningLine(rankLabelHtml(1), s.dist1, maxDist)}
${winningLine(rankLabelHtml(2), s.dist2, maxDist)}
${winningLine(rankLabelHtml(3), s.dist3, maxDist)}
${winningLine(rankLabelHtml(4), s.dist4, maxDist)}
${winningLine(rankLabelHtml(5), s.dist5, maxDist)}
${winningLine(rankLabelHtml(6), s.dist6, maxDist)}

${STATS_TOURNAMENTS} Tournaments
${s.tournaments_played} total · ${s.tournaments_won} won (${percent(s.tournaments_won, s.tournaments_played)}%) · ${s.tournament_points} points

${STATS_DUELS} Duels
${s.duels_played} total · ${s.duels_won} won (${percent(s.duels_won, s.duels_played)}%)`;
}

export function humanMs(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

export function standingsText(t: TournamentRow): string {
  const rows = [...t.players]
    .map((p) => ({ p, pts: t.scores[String(p.userId)] ?? 0 }))
    .sort((a, b) => b.pts - a.pts)
    .map((r, i) => `${rankLabelHtml(i + 1)} ${r.p.userName} — ${r.pts} pts`);
  return rows.join('\n');
}

export function turnOrderText(t: TournamentRow): string {
  return roundOrder(t.players, t.current_round)
    .map((p) => p.userName)
    .join(' → ');
}
