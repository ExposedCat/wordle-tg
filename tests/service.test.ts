import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { isGuessText } from '../src/engine/language.js';
import { ANSWERS, ANSWERS_RU, answersForLanguage, isValidWord } from '../src/engine/words.js';
import { GameService, MAX_GUESSES, pointsForGuessNumber, roundOrder } from '../src/game/service.js';

const CHAT = -100500;
const A = { id: 1, name: 'Alice' };
const B = { id: 2, name: 'Bob' };
const C = { id: 3, name: 'Cara' };

let db: Database.Database;
let svc: GameService;

beforeEach(() => {
  db = openDb(':memory:');
  svc = new GameService(db);
});

function forceAnswer(gameId: number, answer: string): void {
  db.prepare('UPDATE games SET answer = ? WHERE id = ?').run(answer, gameId);
}

function wrongWords(answer: string, n: number): string[] {
  return ANSWERS.filter((w) => w !== answer).slice(0, n);
}

describe('basic game flow', () => {
  it('start, guess, solve — with stats', () => {
    const game = svc.startGame(CHAT)!;
    expect(game).toBeTruthy();
    expect(svc.startGame(CHAT)).toBeNull(); // only one active game

    const [w1] = wrongWords(game.answer, 1);
    const r1 = svc.submitGuess(CHAT, A, w1);
    expect(r1.type).toBe('accepted');
    if (r1.type === 'accepted') {
      expect(r1.guessNumber).toBe(1);
      expect(r1.quality?.possibleCount).toBeGreaterThan(0);
    }

    const r2 = svc.submitGuess(CHAT, B, game.answer);
    expect(r2.type === 'accepted' && r2.solved).toBe(true);

    const sa = svc.statsFor(CHAT, A.id);
    const sb = svc.statsFor(CHAT, B.id);
    expect(sa.games_played).toBe(1);
    expect(sa.games_won).toBe(1);
    expect(sa.solves).toBe(0);
    expect(sa.current_streak).toBe(1);
    expect(sb.solves).toBe(1);
    expect(sb.dist2).toBe(1);
    expect(sb.guesses_total).toBe(1);
    expect(sb.guess_quality_count).toBe(1);
    expect(sb.guess_expected_remaining_sum).toBeGreaterThan(0);
    expect(sb.guess_quality_points_sum).toBeGreaterThan(0);
    expect(sb.greens).toBe(5);
  });

  it('rejects bad input', () => {
    expect(svc.submitGuess(CHAT, A, 'crane').type).toBe('no_game');
    const game = svc.startGame(CHAT)!;
    expect(svc.submitGuess(CHAT, A, '12345').type).toBe('not_a_word');
    const [w1] = wrongWords(game.answer, 1);
    svc.submitGuess(CHAT, A, w1);
    expect(svc.submitGuess(CHAT, B, w1).type).toBe('already_guessed');
  });

  it('uses the selected language for new games and guesses', () => {
    const s = svc.settings(CHAT);
    s.language = 'ru';
    svc.saveSettings(CHAT, s);

    const game = svc.startGame(CHAT)!;
    expect(game.language).toBe('ru');
    expect(isValidWord(game.answer, 'ru')).toBe(true);
    expect(svc.submitGuess(CHAT, A, 'crane').type).toBe('not_a_word');

    forceAnswer(game.id, 'здесь');
    expect(svc.submitGuess(CHAT, A, 'здесь').type).toBe('accepted');
  });

  it('keeps an active game on the language it started with', () => {
    const game = svc.startGame(CHAT)!;
    svc.setLanguage(CHAT, 'ru');

    const [w1] = wrongWords(game.answer, 1);
    expect(svc.submitGuess(CHAT, A, w1).type).toBe('accepted');
    expect(svc.activeGame(CHAT)?.language).toBe('en');
  });

  it('uses the selected word length for new games and guesses', () => {
    const s = svc.settings(CHAT);
    s.wordLength = 4;
    svc.saveSettings(CHAT, s);

    const game = svc.startGame(CHAT)!;
    expect(game.answer).toHaveLength(4);
    expect(svc.submitGuess(CHAT, A, game.answer.slice(0, 3)).type).toBe('not_a_word');
    expect(svc.submitGuess(CHAT, A, game.answer).type).toBe('accepted');
  });

  it('keeps an active game on the word length it started with', () => {
    const game = svc.startGame(CHAT)!;
    expect(svc.setWordLength(CHAT, 4)).toBeTruthy();

    const [w1] = wrongWords(game.answer, 1);
    expect(svc.submitGuess(CHAT, A, w1).type).toBe('accepted');
    expect(svc.activeGame(CHAT)?.answer.length).toBe(5);
  });

  it('loses after 6 wrong guesses and resets streak', () => {
    const game = svc.startGame(CHAT)!;
    const words = wrongWords(game.answer, MAX_GUESSES);
    let last;
    for (const w of words) last = svc.submitGuess(CHAT, A, w);
    expect(last!.type === 'accepted' && last!.lost).toBe(true);
    expect(svc.activeGame(CHAT)).toBeNull();
    const s = svc.statsFor(CHAT, A.id);
    expect(s.games_played).toBe(1);
    expect(s.games_won).toBe(0);
    expect(s.current_streak).toBe(0);
  });

  it('aggregates global stats across chats for a user', () => {
    const otherChat = -100501;
    const game1 = svc.startGame(CHAT)!;
    forceAnswer(game1.id, 'water');
    svc.submitGuess(CHAT, A, 'crane');
    svc.submitGuess(CHAT, A, 'water');

    const game2 = svc.startGame(otherChat)!;
    forceAnswer(game2.id, 'water');
    for (const w of wrongWords('water', MAX_GUESSES)) svc.submitGuess(otherChat, A, w);

    const game3 = svc.startGame(-100502)!;
    forceAnswer(game3.id, 'water');
    svc.submitGuess(-100502, B, 'water');

    const s = svc.globalStatsFor(A.id);
    expect(s.games_played).toBe(2);
    expect(s.games_won).toBe(1);
    expect(s.solves).toBe(1);
    expect(s.guesses_total).toBe(8);
    expect(s.guess_quality_count).toBe(8);
    expect(s.guess_expected_remaining_sum).toBeGreaterThan(0);
    expect(s.guess_quality_points_sum).toBeGreaterThan(0);
    expect(s.current_streak).toBe(1);
    expect(s.best_streak).toBe(1);
    expect(s.dist2).toBe(1);
  });

  it('finds chat stats by exact name before partial matches', () => {
    svc.statsFor(CHAT, A.id);
    svc.statsFor(CHAT, B.id);
    svc.statsFor(CHAT, C.id);
    db.prepare('UPDATE stats SET name = ?, games_played = ? WHERE chat_id = ? AND user_id = ?').run('Alice', 2, CHAT, A.id);
    db.prepare('UPDATE stats SET name = ?, games_played = ? WHERE chat_id = ? AND user_id = ?').run('Alice Cooper', 50, CHAT, B.id);
    db.prepare('UPDATE stats SET name = ?, games_played = ? WHERE chat_id = ? AND user_id = ?').run('Malice', 100, CHAT, C.id);

    expect(svc.findStatsByName(CHAT, 'alice')?.user_id).toBe(A.id);
    expect(svc.findStatsByName(CHAT, 'coop')?.user_id).toBe(B.id);
    expect(svc.findStatsByName(CHAT, 'unknown')).toBeNull();
  });

  it('giveup reveals the answer', () => {
    expect(svc.giveUp(CHAT)).toBeNull();
    const game = svc.startGame(CHAT)!;
    const res = svc.giveUp(CHAT);
    expect(res?.answer).toBe(game.answer);
    expect(svc.activeGame(CHAT)).toBeNull();
  });
});

describe('creativity mode', () => {
  it('blocks recently used words (time mode)', () => {
    const s = svc.settings(CHAT);
    s.creativity.enabled = true;
    s.creativity.configured = true;
    s.creativity.mode = 'time';
    s.creativity.seconds = 3600;
    svc.saveSettings(CHAT, s);

    const g1 = svc.startGame(CHAT)!;
    const [w1] = wrongWords(g1.answer, 1);
    svc.submitGuess(CHAT, A, w1);
    svc.giveUp(CHAT);

    svc.startGame(CHAT);
    expect(svc.submitGuess(CHAT, A, w1).type).toBe('creativity_blocked');

    const disabled = svc.settings(CHAT);
    disabled.creativity.enabled = false;
    svc.saveSettings(CHAT, disabled);
    expect(svc.submitGuess(CHAT, A, w1).type).toBe('accepted');
  });

  it('count mode only bans the last N words', () => {
    const s = svc.settings(CHAT);
    s.creativity.enabled = true;
    s.creativity.configured = true;
    s.creativity.mode = 'count';
    s.creativity.count = 1;
    svc.saveSettings(CHAT, s);

    const g1 = svc.startGame(CHAT)!;
    const [w1, w2] = wrongWords(g1.answer, 2);
    svc.submitGuess(CHAT, A, w1);
    svc.submitGuess(CHAT, A, w2);
    svc.giveUp(CHAT); // burns the answer too (now the only banned word)

    const g2 = svc.startGame(CHAT)!;
    if (w1 !== g2.answer) {
      expect(svc.submitGuess(CHAT, A, w1).type).toBe('accepted');
    }
  });

  it('never picks a recently used answer', () => {
    const g1 = svc.startGame(CHAT)!;
    svc.giveUp(CHAT); // records g1.answer as used
    for (let i = 0; i < 25; i++) {
      const g = svc.startGame(CHAT)!;
      expect(g.answer).not.toBe(g1.answer);
      svc.giveUp(CHAT);
    }
  });
});

describe('hard & super hard mode', () => {
  it('hard mode rejects guesses that ignore hints', () => {
    const s = svc.settings(CHAT);
    s.difficulty = 'hard';
    svc.saveSettings(CHAT, s);

    const game = svc.startGame(CHAT)!;
    forceAnswer(game.id, 'water');
    svc.submitGuess(CHAT, A, 'trace'); // t,r,a,e yellow
    const r = svc.submitGuess(CHAT, A, 'spill');
    expect(r.type).toBe('hard_mode_violation');
    expect(svc.submitGuess(CHAT, A, 'eater').type).toBe('accepted');
  });

  it('super hard mode also bans gray letters', () => {
    const s = svc.settings(CHAT);
    s.difficulty = 'superhard';
    s.creativity.enabled = false;
    svc.saveSettings(CHAT, s);

    const game = svc.startGame(CHAT)!;
    forceAnswer(game.id, 'water');
    svc.submitGuess(CHAT, A, 'crane'); // c, n gray; r,a,e yellow
    const r = svc.submitGuess(CHAT, A, 'racer'); // has r,a,e but replays gray c
    expect(r.type).toBe('hard_mode_violation');
    if (r.type === 'hard_mode_violation') expect(r.superHard).toBe(true);
    expect(svc.submitGuess(CHAT, A, 'water').type).toBe('accepted');
  });
});

describe('tournaments', () => {
  it('rotation and points helpers', () => {
    const players = [A, B, C].map((u) => ({ userId: u.id, userName: u.name }));
    expect(roundOrder(players, 1).map((p) => p.userId)).toEqual([1, 2, 3]);
    expect(roundOrder(players, 2).map((p) => p.userId)).toEqual([2, 3, 1]);
    expect(roundOrder(players, 3).map((p) => p.userId)).toEqual([3, 1, 2]);
    expect(roundOrder(players, 4).map((p) => p.userId)).toEqual([1, 2, 3]);
    expect(pointsForGuessNumber(1)).toBe(6);
    expect(pointsForGuessNumber(6)).toBe(1);
  });

  it('defaults tournament max-fails to 5 in chat settings', () => {
    expect(svc.settings(CHAT).tournamentMaxFails).toBe(5);
  });

  it('defaults board cleanup to off in chat settings', () => {
    expect(svc.settings(CHAT).cleanup).toBe(false);
  });

  it('defaults guess roasts to off in chat settings', () => {
    expect(svc.settings(CHAT).roast).toBe(false);
  });

  it('defaults tournament turn timer to off in chat settings', () => {
    expect(svc.settings(CHAT).tournamentTurnSeconds).toBeNull();
  });

  it('remembers last board messages per chat topic', () => {
    svc.saveBoardMessageIds(CHAT, null, [11, 12, 13]);
    svc.saveBoardMessageIds(CHAT, 123, [21, 22]);

    expect(svc.boardMessageIds(CHAT, null)).toEqual([11, 12, 13]);
    expect(svc.boardMessageIds(CHAT, 123)).toEqual([21, 22]);
    expect(svc.boardMessageIds(CHAT, 456)).toEqual([]);
  });

  it('requires at least two players to start', () => {
    const t0 = svc.createTournament(CHAT, 2, A)!;

    expect(svc.startTournament(t0.id)).toBe('too_few');
    expect(svc.openTournament(CHAT)?.status).toBe('joining');
  });

  it('remembers the forum topic for tournament timer messages', () => {
    const t0 = svc.createTournament(CHAT, 2, A, 123)!;

    expect(t0.message_thread_id).toBe(123);
    expect(svc.openTournament(CHAT)?.message_thread_id).toBe(123);
  });

  it('full 2-round tournament with turn enforcement and scoring', () => {
    const t0 = svc.createTournament(CHAT, 2, A)!;
    expect(t0.players).toHaveLength(1);
    expect(svc.joinTournament(t0.id, B)).not.toBe('already_in');
    expect(svc.joinTournament(t0.id, B)).toBe('already_in');

    const started = svc.startTournament(t0.id);
    expect(started).not.toBe('too_few');
    const { game } = started as Exclude<typeof started, 'too_few' | null>;
    forceAnswer(game.id, 'water');

    // round 1, order A → B
    expect(svc.submitGuess(CHAT, C, 'crane').type).toBe('ignored');
    expect(svc.submitGuess(CHAT, C, 'xxxxx').type).toBe('ignored');
    expect(svc.activeGame(CHAT)!.guesses).toHaveLength(0);
    expect(svc.submitGuess(CHAT, B, 'crane').type).toBe('not_your_turn');
    expect(svc.submitGuess(CHAT, B, 'xxxxx').type).toBe('not_your_turn');
    expect(svc.submitGuess(CHAT, A, 'crane').type).toBe('accepted');
    expect(svc.submitGuess(CHAT, A, 'trace').type).toBe('not_your_turn');

    const solve1 = svc.submitGuess(CHAT, B, 'water');
    expect(solve1.type).toBe('accepted');
    if (solve1.type !== 'accepted' || !solve1.tournament) throw new Error('expected tournament outcome');
    expect(solve1.tournament.pointsAwarded).toBe(5); // solved on guess #2
    expect(solve1.tournament.roundEnded).toBe(true);
    expect(solve1.tournament.tournamentEnded).toBe(false);
    expect(solve1.tournament.nextPlayer?.userId).toBe(B.id); // round 2 order rotates to B → A

    // round 2: B goes first and nails it on guess #1
    const game2 = solve1.tournament.nextGame!;
    forceAnswer(game2.id, 'abbey');
    const solve2 = svc.submitGuess(CHAT, B, 'abbey');
    if (solve2.type !== 'accepted' || !solve2.tournament) throw new Error('expected tournament outcome');
    expect(solve2.tournament.pointsAwarded).toBe(6);
    expect(solve2.tournament.tournamentEnded).toBe(true);
    expect(solve2.tournament.winners.map((w) => w.userId)).toEqual([B.id]);
    expect(solve2.tournament.t.scores[String(B.id)]).toBe(11);

    const sb = svc.statsFor(CHAT, B.id);
    expect(sb.tournaments_played).toBe(1);
    expect(sb.tournaments_won).toBe(1);
    expect(sb.tournament_points).toBe(11);
    expect(svc.statsFor(CHAT, A.id).tournaments_won).toBe(0);
  });

  it('forfeits a tournament turn after too many unknown words', () => {
    const s = svc.settings(CHAT);
    s.tournamentMaxFails = 2;
    svc.saveSettings(CHAT, s);

    const t0 = svc.createTournament(CHAT, 1, A)!;
    svc.joinTournament(t0.id, B);
    const started = svc.startTournament(t0.id);
    expect(started).not.toBe('too_few');

    const r1 = svc.submitGuess(CHAT, A, '12345');
    expect(r1.type).toBe('not_a_word');
    if (r1.type !== 'not_a_word') throw new Error('expected rejection');
    expect(r1.rejectStatus?.remaining).toBe(1);
    expect(r1.rejectStatus?.limit).toBe(2);
    expect(r1.rejectStatus?.forfeit).toBeUndefined();
    expect(svc.openTournament(CHAT)?.fail_count).toBe(1);

    const r2 = svc.submitGuess(CHAT, A, '67890');
    expect(r2.type).toBe('not_a_word');
    if (r2.type !== 'not_a_word') throw new Error('expected rejection');
    expect(r2.rejectStatus?.remaining).toBe(0);
    expect(r2.rejectStatus?.limit).toBe(2);
    expect(r2.rejectStatus?.forfeit?.nextPlayer.userId).toBe(B.id);
    expect(svc.openTournament(CHAT)?.fail_count).toBe(0);
    expect(svc.submitGuess(CHAT, A, 'crane').type).toBe('not_your_turn');
  });

  it('expires only the live tournament turn for the saved timestamp', () => {
    const t0 = svc.createTournament(CHAT, 1, A)!;
    svc.joinTournament(t0.id, B);
    const started = svc.startTournament(t0.id);
    expect(started).not.toBe('too_few');
    if (started === 'too_few' || started === null) throw new Error('expected tournament start');

    const originalStartedAt = started.t.turn_started_at!;
    expect(svc.expireTournamentTurn(t0.id, originalStartedAt - 1)).toBeNull();

    const expired = svc.expireTournamentTurn(t0.id, originalStartedAt);
    expect(expired?.expiredPlayer.userId).toBe(A.id);
    expect(expired?.nextPlayer.userId).toBe(B.id);
    expect(expired?.t.turn_idx).toBe(1);
    expect(expired?.t.fail_count).toBe(0);
    expect(expired?.t.turn_started_at).toBeGreaterThanOrEqual(originalStartedAt);
    expect(svc.expireTournamentTurn(t0.id, originalStartedAt)).toBeNull();
  });

  it('can disable tournament max-fails', () => {
    const s = svc.settings(CHAT);
    s.tournamentMaxFails = null;
    svc.saveSettings(CHAT, s);

    const t0 = svc.createTournament(CHAT, 1, A)!;
    svc.joinTournament(t0.id, B);
    svc.startTournament(t0.id);

    expect(svc.submitGuess(CHAT, A, '12345').type).toBe('not_a_word');
    const r = svc.submitGuess(CHAT, A, '67890');
    expect(r.type).toBe('not_a_word');
    if (r.type !== 'not_a_word') throw new Error('expected rejection');
    expect(r.rejectStatus).toBeUndefined();
    expect(svc.openTournament(CHAT)?.turn_idx).toBe(0);
    expect(svc.openTournament(CHAT)?.fail_count).toBe(0);
  });

  it('forfeits a tournament turn after too many hard-mode violations', () => {
    const s = svc.settings(CHAT);
    s.difficulty = 'hard';
    s.tournamentMaxFails = 2;
    svc.saveSettings(CHAT, s);

    const t0 = svc.createTournament(CHAT, 1, A)!;
    svc.joinTournament(t0.id, B);
    const started = svc.startTournament(t0.id);
    expect(started).not.toBe('too_few');
    const { game } = started as Exclude<typeof started, 'too_few' | null>;
    forceAnswer(game.id, 'water');

    expect(svc.submitGuess(CHAT, A, 'trace').type).toBe('accepted');
    expect(svc.submitGuess(CHAT, B, 'spill').type).toBe('hard_mode_violation');
    const r = svc.submitGuess(CHAT, B, 'crane');
    expect(r.type).toBe('hard_mode_violation');
    if (r.type !== 'hard_mode_violation') throw new Error('expected hard-mode violation');
    expect(r.rejectStatus?.remaining).toBe(0);
    expect(r.rejectStatus?.forfeit?.nextPlayer.userId).toBe(A.id);
    expect(svc.openTournament(CHAT)?.turn_idx).toBe(0);
  });

  it('forfeits a tournament turn after a super-hard violation hits the limit', () => {
    const s = svc.settings(CHAT);
    s.difficulty = 'superhard';
    s.tournamentMaxFails = 1;
    svc.saveSettings(CHAT, s);

    const t0 = svc.createTournament(CHAT, 1, A)!;
    svc.joinTournament(t0.id, B);
    const started = svc.startTournament(t0.id);
    expect(started).not.toBe('too_few');
    const { game } = started as Exclude<typeof started, 'too_few' | null>;
    forceAnswer(game.id, 'water');

    expect(svc.submitGuess(CHAT, A, 'crane').type).toBe('accepted');
    const r = svc.submitGuess(CHAT, B, 'racer');
    expect(r.type).toBe('hard_mode_violation');
    if (r.type !== 'hard_mode_violation') throw new Error('expected super-hard violation');
    expect(r.superHard).toBe(true);
    expect(r.rejectStatus?.remaining).toBe(0);
    expect(r.rejectStatus?.forfeit?.nextPlayer.userId).toBe(A.id);
    expect(svc.openTournament(CHAT)?.turn_idx).toBe(0);
    expect(svc.openTournament(CHAT)?.fail_count).toBe(0);
  });

  it('forfeits a tournament turn after a creativity violation hits the limit', () => {
    const s = svc.settings(CHAT);
    s.tournamentMaxFails = 1;
    s.creativity.enabled = true;
    s.creativity.configured = true;
    s.creativity.mode = 'time';
    s.creativity.seconds = 3600;
    svc.saveSettings(CHAT, s);

    db.prepare('INSERT INTO used_words (chat_id, word, used_at) VALUES (?, ?, ?)').run(CHAT, 'crane', Date.now());
    const t0 = svc.createTournament(CHAT, 1, A)!;
    svc.joinTournament(t0.id, B);
    const started = svc.startTournament(t0.id);
    expect(started).not.toBe('too_few');
    const { game } = started as Exclude<typeof started, 'too_few' | null>;
    forceAnswer(game.id, 'water');

    const r = svc.submitGuess(CHAT, A, 'crane');
    expect(r.type).toBe('creativity_blocked');
    if (r.type !== 'creativity_blocked') throw new Error('expected creativity block');
    expect(r.rejectStatus?.remaining).toBe(0);
    expect(r.rejectStatus?.forfeit?.nextPlayer.userId).toBe(B.id);
    expect(svc.openTournament(CHAT)?.turn_idx).toBe(1);
  });

  it('starts unspecified-round tournament with one round per joined player', () => {
    const t0 = svc.createTournament(CHAT, 0, A)!;
    svc.joinTournament(t0.id, B);
    svc.joinTournament(t0.id, C);

    const started = svc.startTournament(t0.id);
    expect(started).not.toBe('too_few');
    expect((started as Exclude<typeof started, 'too_few' | null>).t.rounds).toBe(3);
  });

  it('lets players quit an open tournament', () => {
    const t0 = svc.createTournament(CHAT, 0, A)!;
    svc.joinTournament(t0.id, B);

    const res = svc.quitTournament(t0.id, B.id);
    expect(res).not.toBe('not_in');
    expect((res as Exclude<typeof res, 'closed' | 'not_in' | null>).players.map((p) => p.userId)).toEqual([A.id]);
    expect(svc.quitTournament(t0.id, B.id)).toBe('not_in');
  });

  it('cancels an open tournament when the last player quits', () => {
    const t0 = svc.createTournament(CHAT, 0, A)!;

    const res = svc.quitTournament(t0.id, A.id);
    expect(res).not.toBe('not_in');
    const t = res as Exclude<typeof res, 'closed' | 'not_in' | null>;
    expect(t.players).toEqual([]);
    expect(t.status).toBe('cancelled');
    expect(svc.openTournament(CHAT)).toBeNull();
  });

  it('giveup cancels an open tournament lobby', () => {
    svc.createTournament(CHAT, 0, A)!;

    const res = svc.giveUp(CHAT);
    expect(res).toEqual({ answer: null, tournamentCancelled: true });
    expect(svc.openTournament(CHAT)).toBeNull();
  });

  it('cancel: only the creator can', () => {
    const t = svc.createTournament(CHAT, 3, A)!;
    expect(svc.cancelTournament(CHAT, B.id)).toBe('not_allowed');
    const res = svc.cancelTournament(CHAT, A.id);
    expect(res).not.toBe('not_allowed');
    expect(svc.openTournament(CHAT)).toBeNull();
    expect(t.id).toBeTruthy();
  });
});

describe('duels', () => {
  it('remembers the forum topic for later group announcements', () => {
    const GROUP = -200;
    const d0 = svc.createDuel(GROUP, A, 123);

    expect(d0.message_thread_id).toBe(123);
    expect(svc.getDuel(d0.id)?.message_thread_id).toBe(123);
  });

  it('full duel: fewer guesses wins, group stats recorded', () => {
    const GROUP = -200;
    const d0 = svc.createDuel(GROUP, A);
    db.prepare('UPDATE duels SET answer = ? WHERE id = ?').run('water', d0.id);

    const accA = svc.acceptDuel(d0.id, 100, A);
    expect(accA).not.toBe('not_found');
    const accB = svc.acceptDuel(d0.id, 200, B);
    expect(accB).not.toBe('full');
    expect(svc.acceptDuel(d0.id, 300, C)).toBe('full');

    // Alice solves in 2
    svc.submitGuess(100, A, 'crane');
    const ra = svc.submitGuess(100, A, 'water');
    if (ra.type !== 'accepted' || !ra.duel) throw new Error('expected duel outcome');
    expect(ra.duel.finished).toBe(true);
    expect(ra.duel.bothDone).toBe(false);

    // Bob fails all 6
    let rb;
    for (const w of wrongWords('water', MAX_GUESSES)) rb = svc.submitGuess(200, B, w);
    if (rb!.type !== 'accepted' || !rb!.duel) throw new Error('expected duel outcome');
    expect(rb!.duel.bothDone).toBe(true);

    const d = svc.getDuel(d0.id)!;
    expect(d.status).toBe('done');
    const winner = svc.duelWinner(d);
    expect(winner !== 'draw' && winner?.userId).toBe(A.id);

    expect(svc.statsFor(GROUP, A.id).duels_won).toBe(1);
    expect(svc.statsFor(GROUP, B.id).duels_played).toBe(1);
    expect(svc.statsFor(GROUP, B.id).duels_won).toBe(0);
  });
});

describe('word list sanity', () => {
  it('accepts English and Cyrillic guess text for /w and /auto at the selected length', () => {
    expect(isGuessText('crane')).toBe(true);
    expect(isGuessText('ЗДЕСЬ')).toBe(true);
    expect(isGuessText('здесь')).toBe(true);
    expect(isGuessText('дом', 3)).toBe(true);
    expect(isGuessText('дома', 3)).toBe(false);
    expect(isGuessText('дом')).toBe(false);
    expect(isGuessText('12345')).toBe(false);
  });

  it('has the expected shape', () => {
    expect(ANSWERS.length).toBeGreaterThan(2000);
    expect(ANSWERS_RU.length).toBeGreaterThan(2000);
    for (const w of ['water', 'crane', 'trace', 'abbey', 'eater', 'racer']) {
      expect(isValidWord(w)).toBe(true);
    }
    for (const w of ['здесь', 'когда', 'жизнь']) {
      expect(isValidWord(w, 'ru')).toBe(true);
    }
    expect(isValidWord('12345')).toBe(false);
    expect(isValidWord('crane', 'ru')).toBe(false);
  });

  it('loads JSON word data for all supported lengths', () => {
    for (let length = 3; length <= 10; length++) {
      const english = answersForLanguage('en', length);
      const russian = answersForLanguage('ru', length);
      expect(english.length).toBeGreaterThan(100);
      expect(russian.length).toBeGreaterThan(100);
      expect(english[0]).toHaveLength(length);
      expect(russian[0]).toHaveLength(length);
      expect(isValidWord(english[0], 'en', length)).toBe(true);
      expect(isValidWord(russian[0], 'ru', length)).toBe(true);
    }
  });
});
