import { describe, expect, it } from 'vitest';
import { alreadyGuessedText, giveUpText, hardModeViolationText, standingsText, statsText } from '../src/bot/format.js';
import type { StatsRow, TournamentRow } from '../src/db.js';
import { EmojiPackConfig, orderedTileKeys } from '../src/render/emoji-pack.js';

function pack(): EmojiPackConfig {
  return {
    name: 'test_pack',
    tiles: Object.fromEntries(orderedTileKeys().map((key) => [key, `${key}-id`])) as EmojiPackConfig['tiles'],
  };
}

describe('hardModeViolationText', () => {
  it('formats required hard-mode hints as colored letters', () => {
    expect(
      hardModeViolationText(
        {
          required: [
            { letter: 'W', color: 'green' },
            { letter: 'A', color: 'yellow' },
          ],
          forbidden: [],
        },
        false,
        null
      )
    ).toBe('Hard: you must use 🟩W 🟨A');
  });

  it('formats super-hard forbidden hints on a darker second line', () => {
    expect(
      hardModeViolationText(
        {
          required: [
            { letter: 'R', color: 'yellow' },
            { letter: 'A', color: 'yellow' },
            { letter: 'E', color: 'yellow' },
          ],
          forbidden: ['C'],
        },
        true,
        null
      )
    ).toBe('Super-hard: you must use 🟨R 🟨A 🟨E.\nYou cannot use ⬛C');
  });
});

describe('alreadyGuessedText', () => {
  it('uses fallback scored letters', () => {
    expect(alreadyGuessedText('trace', 'water', null)).toBe(
      '🟨T 🟨R 🟨A ⬛C 🟨E was already guessed'
    );
  });

  it('uses custom emoji tiles for the scored word', () => {
    const text = alreadyGuessedText('water', 'water', pack());

    expect(text).not.toContain('5845943483382110702');
    expect(text).toContain('W-green-id');
    expect(text).toContain('A-green-id');
    expect(text).toContain('T-green-id');
    expect(text).toContain('E-green-id');
    expect(text).toContain('R-green-id');
  });
});

describe('giveUpText', () => {
  it('uses the custom game-over emoji label and reveals the answer', () => {
    expect(giveUpText('water')).toBe(
      '<tg-emoji emoji-id="5927054181285237634">🏳️</tg-emoji> Game Over! The word was WATER.'
    );
  });
});

describe('statsText', () => {
  it('formats compact stats sections with total and letter-rate percentages', () => {
    const stats: StatsRow = {
      chat_id: 1,
      user_id: 2,
      name: 'Ada',
      games_played: 10,
      games_won: 4,
      solves: 2,
      guesses_total: 8,
      guess_quality_count: 8,
      guess_expected_remaining_sum: 123.4,
      guess_quality_points_sum: 534,
      greens: 10,
      yellows: 6,
      current_streak: 3,
      best_streak: 7,
      dist1: 0,
      dist2: 1,
      dist3: 2,
      dist4: 3,
      dist5: 4,
      dist6: 5,
      fastest_ms: null,
      tournaments_played: 5,
      tournaments_won: 2,
      tournament_points: 13,
      duels_played: 3,
      duels_won: 1,
    };

    expect(statsText(stats, 'Ada <Lovelace>', 'Math & Games')).toBe(`<tg-emoji emoji-id="5778575233422200567">👤</tg-emoji> Ada &lt;Lovelace&gt; · Math &amp; Games

<tg-emoji emoji-id="6008090211181923982">🎮</tg-emoji> Games
10 total · 4 won (40%) · 2 finished (20% / 50%)
3 in a row · max 7

<tg-emoji emoji-id="6005695599410679642">🔠</tg-emoji> Guesses
8 guesses · <tg-emoji emoji-id="5280718893806034581">🔠</tg-emoji> 6 (75% / 15%) · <tg-emoji emoji-id="5282832726385268445">🔠</tg-emoji> 10 (125% / 25%)
67/100 quality score · 15.4 words left on average

<tg-emoji emoji-id="6008135256798927387">🏆</tg-emoji> Winning
<tg-emoji emoji-id="5794182096603847292">1️⃣</tg-emoji>
<tg-emoji emoji-id="5794303034292968945">2️⃣</tg-emoji> ■◗
<tg-emoji emoji-id="5794031944547178894">3️⃣</tg-emoji> ■■◗
<tg-emoji emoji-id="5793901252987330401">4️⃣</tg-emoji> ■■■◗
<tg-emoji emoji-id="5794066823976592976">5️⃣</tg-emoji> ■■■■◗
<tg-emoji emoji-id="5794235255414069703">6️⃣</tg-emoji> ■■■■■◗

<tg-emoji emoji-id="5942877472163892475">👥</tg-emoji> Tournaments
5 total · 2 won (40%) · 13 points

<tg-emoji emoji-id="5944940516754853337">⚔️</tg-emoji> Duels
3 total · 1 won (33%)`);
  });
});

describe('standingsText', () => {
  it('uses custom rank icons for 1-6 and regular numbers from 7 on', () => {
    const players = Array.from({ length: 7 }, (_, index) => ({
      userId: index + 1,
      userName: `Player ${index + 1}`,
    }));
    const tournament: TournamentRow = {
      id: 1,
      chat_id: 2,
      rounds: 1,
      current_round: 1,
      status: 'active',
      players,
      scores: Object.fromEntries(players.map((player, index) => [String(player.userId), 7 - index])),
      turn_idx: 0,
      fail_count: 0,
      created_by: 1,
    };

    expect(standingsText(tournament)).toBe(`<tg-emoji emoji-id="5794182096603847292">1️⃣</tg-emoji> Player 1 — 7 pts
<tg-emoji emoji-id="5794303034292968945">2️⃣</tg-emoji> Player 2 — 6 pts
<tg-emoji emoji-id="5794031944547178894">3️⃣</tg-emoji> Player 3 — 5 pts
<tg-emoji emoji-id="5793901252987330401">4️⃣</tg-emoji> Player 4 — 4 pts
<tg-emoji emoji-id="5794066823976592976">5️⃣</tg-emoji> Player 5 — 3 pts
<tg-emoji emoji-id="5794235255414069703">6️⃣</tg-emoji> Player 6 — 2 pts
7. Player 7 — 1 pts`);
  });
});
