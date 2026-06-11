import { describe, expect, it } from 'vitest';
import { boardMessageIdsForCleanup } from '../src/bot/handlers.js';

describe('board cleanup policy', () => {
  it('does not remember solved boards for future cleanup', () => {
    expect(boardMessageIdsForCleanup({ status: 'solved' }, [11, 12, 13])).toEqual([]);
  });

  it('remembers unfinished and failed boards for future cleanup', () => {
    expect(boardMessageIdsForCleanup({ status: 'active' }, [21, 22])).toEqual([21, 22]);
    expect(boardMessageIdsForCleanup({ status: 'lost' }, [31])).toEqual([31]);
  });
});
