import { describe, expect, it } from 'vitest';
import { guessQuality, possibleSecretWords, qualityPoints } from '../src/engine/guess-quality.js';

const answers = ['abcde', 'abfde', 'abgde', 'xyzab'];

describe('guessQuality', () => {
  it('gives 100 points when the actual feedback leaves one word', () => {
    const quality = guessQuality('abcde', [], 'abcde', answers);

    expect(quality.possibleCount).toBe(4);
    expect(quality.actualRemaining).toBe(1);
    expect(quality.points).toBe(100);
  });

  it('uses the pre-guess state to narrow possible secret words', () => {
    expect(possibleSecretWords('abfde', ['abcde'], answers)).toEqual(['abfde', 'abgde']);

    const quality = guessQuality('abfde', ['abcde'], 'fzzzz', answers);
    expect(quality.possibleCount).toBe(2);
    expect(quality.actualRemaining).toBe(1);
    expect(quality.points).toBe(100);
  });

  it('maps average remaining to 50 quality points', () => {
    expect(qualityPoints(1, 10)).toBe(100);
    expect(qualityPoints(10, 10)).toBe(50);
    expect(qualityPoints(19, 10)).toBe(0);
  });
});
