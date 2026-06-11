import { ChatSettings, Difficulty, OneshotDifficulty, StatsRow, TournamentRow } from '../db.js';
import type { HardModeViolation } from '../engine/hardmode.js';
import { DEFAULT_WORD_LENGTH, LANGUAGE_LABELS } from '../engine/language.js';
import { scoreGuess, type TileStatus } from '../engine/score.js';
import { roundOrder } from '../game/service.js';
import { escapeHtml, formatTileLetter, type EmojiPackConfig, type TileColor } from '../render/emoji-pack.js';

const WORDLE_ICON = '<tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji>';
const ONESHOT_ICON = '<tg-emoji emoji-id="5936130851635990622">🎯</tg-emoji>';
const CREATIVITY_ICON = '<tg-emoji emoji-id="5877410604225924969">✨</tg-emoji>';
const MULTIPLAYER_ICON = '<tg-emoji emoji-id="5942877472163892475">👥</tg-emoji>';
const DUELS_ICON = '<tg-emoji emoji-id="5944940516754853337">⚔️</tg-emoji>';
const STATS_ICON = '<tg-emoji emoji-id="5778575233422200567">👤</tg-emoji>';
const PREFERENCES_ICON = '<tg-emoji emoji-id="5877260593903177342">⚙️</tg-emoji>';
const LANGUAGE_ICON = '<tg-emoji emoji-id="5778184941154078090">🌐</tg-emoji>';
const LENGTH_ICON = '<tg-emoji emoji-id="6008135256798927387">🏆</tg-emoji>';
const GUESS_MODE_ICON = '<tg-emoji emoji-id="6005695599410679642">🔠</tg-emoji>';
const REJECTED_GUESSES_ICON = '<tg-emoji emoji-id="5879813604068298387">❗</tg-emoji>';
const TIMER_ICON = '<tg-emoji emoji-id="5960751816084820359">⏱</tg-emoji>';
const AUTO_ICON = '<tg-emoji emoji-id="5881986900469748194">🤖</tg-emoji>';
const CLEANUP_ICON = '<tg-emoji emoji-id="5879937509579820068">🧹</tg-emoji>';
const ROAST_ICON = '<tg-emoji emoji-id="5924666978332578279">🔥</tg-emoji>';
const EMOJI_PACK_ICON = '<tg-emoji emoji-id="5784982040432611567">😀</tg-emoji>';
const SOURCE_CODE =
  '<tg-emoji emoji-id="5884343982816759327">💻</tg-emoji> <a href="https://github.com/ExposedCat/wordle-tg">Source Code</a> (forked <a href="https://github.com/Argotoss/telewordle">telewordle</a>)';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  normal: '😎 normal',
  hard: '😤 hard',
  superhard: '🔥 super hard',
};

export const ONESHOT_DIFFICULTY_LABEL: Record<OneshotDifficulty, string> = {
  easy: 'easy',
  normal: 'normal',
  hard: 'hard',
  expert: 'expert',
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

function onOff(enabled: boolean): string {
  return enabled ? 'on' : 'off';
}

function creativityValue(s: ChatSettings): string {
  if (!s.creativity.configured || !s.creativity.enabled) return 'off';
  return s.creativity.mode === 'time' ? `on, ${humanDuration(s.creativity.seconds)}` : `on, ${s.creativity.count} words`;
}

function difficultyValue(difficulty: Difficulty): string {
  return difficulty === 'superhard' ? 'super hard' : difficulty;
}

function oneshotPatternText(green: number, yellow: number, emojiPack: EmojiPackConfig | null): string {
  const parts: string[] = [];
  if (green > 0) parts.push(`${formatTileLetter('A', 'green', emojiPack)} ${green}`);
  if (yellow > 0) parts.push(`${formatTileLetter('A', 'yellow', emojiPack)} ${yellow}`);
  return parts.join(' + ');
}

function rejectedGuessesValue(s: ChatSettings): string {
  return s.tournamentMaxFails === null ? 'off' : `${s.tournamentMaxFails}`;
}

function timerValue(s: ChatSettings): string {
  return s.tournamentTurnSeconds === null ? 'off' : humanTurnTime(s.tournamentTurnSeconds);
}

function emojiPackValue(s: ChatSettings): string {
  return s.emojiPack?.name ?? 'off';
}

export function helpText(_s: ChatSettings): string {
  return `${WORDLE_ICON} Wordle /wordle_help
${ONESHOT_ICON} One-shot /oneshot_help
${GUESS_MODE_ICON} Guess Mode /mode_help
${CREATIVITY_ICON} Creativity /creativity_help
${MULTIPLAYER_ICON} Multiplayer /multiplayer_help
${STATS_ICON} Stats /stats_help
${PREFERENCES_ICON} Preferences /preferences_help

${SOURCE_CODE}`;
}

export function describeCreativity(s: ChatSettings): string {
  if (!s.creativity.configured) return 'off — set with /creativity 30m or /creativity 15w';
  if (!s.creativity.enabled) return 'off';
  return s.creativity.mode === 'time'
    ? `on — words from the last ${humanDuration(s.creativity.seconds)} are banned`
    : `on — the last ${s.creativity.count} words are banned`;
}

export function wordleHelpText(): string {
  return `${WORDLE_ICON} Wordle

/wordle
Starts a shared chat game.

/daily
Starts today's shared daily word.

/personal
Starts your own game inside the chat.

/w WORD
Submits a guess.

/board
Reposts the current board.

/stop
Ends the current game.

A chat can have one shared active game at a time. Personal games run separately for each player.`;
}

export function oneshotHelpText(s: ChatSettings): string {
  return `${ONESHOT_ICON} One-shot

/oneshot easy|normal|hard|expert · ${ONESHOT_DIFFICULTY_LABEL[s.oneshotDifficulty]}
Sets the chat's one-shot difficulty.

/oneshot
First row is a random clue word. You get one guess for row two.

${lineTick(s.oneshotDifficulty === 'easy')}easy · ${oneshotPatternText(2, 1, s.emojiPack)}
${lineTick(s.oneshotDifficulty === 'normal')}normal · ${oneshotPatternText(1, 2, s.emojiPack)}
${lineTick(s.oneshotDifficulty === 'hard')}hard · ${oneshotPatternText(1, 1, s.emojiPack)}
${lineTick(s.oneshotDifficulty === 'expert')}expert · ${oneshotPatternText(0, 2, s.emojiPack)}

One-shot games do not affect stats.`;
}

export function modeHelpText(s: ChatSettings): string {
  return `${GUESS_MODE_ICON} Guess Mode

Normal /normal${tick(s.difficulty === 'normal')}
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

export function wordMeaningSuffix(meaning?: string): string {
  return meaning ? ` · ${meaning}` : '';
}

export function answerMeaningText(answer: string, meaning?: string): string {
  return `${answer.toUpperCase()}${wordMeaningSuffix(meaning)}`;
}

export function answerMeaningSentence(answer: string, meaning?: string): string {
  const suffix = meaning && /[.!?]$/.test(meaning.trim()) ? '' : '.';
  return `${answerMeaningText(answer, meaning)}${suffix}`;
}

export function giveUpText(answer: string, meaning?: string): string {
  return `${GAME_OVER} Game Over! The word was ${answerMeaningSentence(answer, meaning)}`;
}

export function creativityHelpText(s: ChatSettings): string {
  return `${CREATIVITY_ICON} Creativity

/creativity · ${creativityValue(s)} ${toggleIcon(s.creativity.enabled)}
Turns creativity on or off using the saved frame.

/creativity 30m · ${s.creativity.configured && s.creativity.mode === 'time' ? humanDuration(s.creativity.seconds) : 'time frame'}${tick(s.creativity.configured && s.creativity.mode === 'time')}
Bans words used within a time window. Supports s, m, h, d.

/creativity 15w · ${s.creativity.configured && s.creativity.mode === 'count' ? `${s.creativity.count} words` : 'word frame'}${tick(s.creativity.configured && s.creativity.mode === 'count')}
Bans the last N used words.`;
}

export function multiplayerHelpText(s: ChatSettings): string {
  return `${MULTIPLAYER_ICON} Multiplayer

${MULTIPLAYER_ICON} Tournaments
/round [N]
Players join with the button, then the creator starts it.
Players guess in turn order. Solving earlier gives more points.

/fails N|off · ${rejectedGuessesValue(s)}
Sets rejected guesses allowed per turn.

/timer 90s · ${timerValue(s)}
Sets a max time per turn. Send /timer with no value to disable it.

${DUELS_ICON} Duels
/duel
Both players get the same word in private chat.
Fewest guesses wins; speed breaks ties.`;
}

export function statsHelpText(): string {
  return `${STATS_ICON} Stats

/profile
Shows your stats in this chat.

/global
Shows your stats across all chats.

/compare
Compares you with another player.

Use /compare by replying to a player, or /compare NAME.
One-shot games do not affect stats.`;
}

export function preferencesHelpText(s: ChatSettings): string {
  return `${PREFERENCES_ICON} Chat Preferences

${LANGUAGE_ICON} /en /ru · ${LANGUAGE_LABELS[s.language]}
Changes language for new games.

${LENGTH_ICON} /length N · ${s.wordLength} letters
Changes word length for new games.

${AUTO_ICON} /auto · ${onOff(s.bareWord)}
Toggles guessing without /w.

${CLEANUP_ICON} /cleanup · ${onOff(s.cleanup)}
Removes previous unsolved board messages when a new board is posted.

${ROAST_ICON} /roast · ${onOff(s.roast)}
Toggles one LLM roast for below-average guesses.

${EMOJI_PACK_ICON} /usepack NAME · ${emojiPackValue(s)}
Uses a custom emoji pack for tile letters.

Active games keep the language and length they started with.`;
}

function tick(enabled: boolean): string {
  return enabled ? ` ${TICK}` : '';
}

function lineTick(enabled: boolean): string {
  return enabled ? `${TICK} ` : '';
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

export function humanTurnTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
}

export function parseTournamentTimerValue(input: string): number | null {
  const time = input.trim().toLowerCase().match(/^(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?)$/);
  if (!time) return null;
  const n = parseInt(time[1], 10);
  if (n <= 0) return null;
  return time[2][0] === 'm' ? n * 60 : n;
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
  const totalLetters = s.guesses_total * DEFAULT_WORD_LENGTH;
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
