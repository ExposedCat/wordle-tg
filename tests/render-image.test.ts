import { describe, expect, it } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { GameRow, StatsRow } from '../src/db.js';
import { renderBoardSticker, renderCompareSticker, renderKeyboardSticker } from '../src/render/image.js';

function game(answer: string, guesses: string[], language: GameRow['language'] = 'en'): GameRow {
  return {
    id: 1,
    chat_id: 1,
    answer,
    language,
    status: 'active',
    kind: 'normal',
    guesses: guesses.map((word, index) => ({ word, userId: 1, userName: 'Ada', ts: index })),
    started_at: 0,
    finished_at: null,
    tournament_id: null,
    duel_id: null,
  };
}

function stats(overrides: Partial<StatsRow> = {}): StatsRow {
  return {
    chat_id: 1,
    user_id: 1,
    name: 'Ada',
    games_played: 0,
    games_won: 0,
    solves: 0,
    guesses_total: 0,
    guess_quality_count: 0,
    guess_expected_remaining_sum: 0,
    guess_quality_points_sum: 0,
    greens: 0,
    yellows: 0,
    current_streak: 0,
    best_streak: 0,
    dist1: 0,
    dist2: 0,
    dist3: 0,
    dist4: 0,
    dist5: 0,
    dist6: 0,
    fastest_ms: null,
    tournaments_played: 0,
    tournaments_won: 0,
    tournament_points: 0,
    duels_played: 0,
    duels_won: 0,
    ...overrides,
  };
}

function expectWebp(buffer: Buffer): void {
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP');
}

function webpDimensions(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('VP8X');
  return {
    width: 1 + buffer.readUIntLE(24, 3),
    height: 1 + buffer.readUIntLE(27, 3),
  };
}

async function pixelAlpha(buffer: Buffer, x: number, y: number): Promise<number> {
  const img = await loadImage(buffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(x, y, 1, 1).data[3];
}

describe('sticker rendering', () => {
  it('renders board and keyboard stickers as WebP images', () => {
    const row = game('water', ['trace', 'wheat']);

    expectWebp(renderBoardSticker(row));
    expectWebp(renderKeyboardSticker(row));
  });

  it('renders Russian keyboard stickers', () => {
    expectWebp(renderKeyboardSticker(game('здесь', ['когда'], 'ru')));
  });

  it('renders compare stickers at full Telegram sticker size', async () => {
    const sticker = await renderCompareSticker(
      {
        name: 'Ada',
        stats: stats({
          games_played: 12,
          games_won: 9,
          solves: 5,
          tournaments_played: 3,
          tournaments_won: 2,
          duels_played: 4,
          duels_won: 3,
          guess_quality_count: 5,
          guess_quality_points_sum: 425,
        }),
      },
      {
        name: 'Grace Hopper',
        stats: stats({
          user_id: 2,
          name: 'Grace',
          games_played: 10,
          games_won: 8,
          solves: 6,
          tournaments_played: 2,
          tournaments_won: 1,
          duels_played: 5,
          duels_won: 4,
          guess_quality_count: 5,
          guess_quality_points_sum: 390,
        }),
      }
    );

    expectWebp(sticker);
    expect(webpDimensions(sticker)).toEqual({ width: 512, height: 512 });
  });

  it('keeps the board sticker at full Telegram sticker size as the keyboard shrinks', () => {
    const sparseKeyboard = game('water', ['quick', 'nymph', 'blogs', 'fjord']);

    expect(webpDimensions(renderBoardSticker(sparseKeyboard))).toEqual({ width: 512, height: 512 });
  });

  it('keeps board sticker margins transparent except for width anchor pixels', async () => {
    const row = game('water', ['trace']);
    const sticker = renderBoardSticker(row);

    expect(await pixelAlpha(sticker, 0, 0)).toBe(0);
    expect(await pixelAlpha(sticker, 0, 256)).toBeGreaterThan(0);
    expect(await pixelAlpha(sticker, 511, 256)).toBeGreaterThan(0);
  });
});
