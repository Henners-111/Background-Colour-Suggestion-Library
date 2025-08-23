import { describe, it, expect } from 'vitest';
import { suggestFmpSymbolBackground } from '../index.js';

// Integration tests hitting live Financial Modeling Prep logo endpoints.
// These are network dependent; keep expectations loose aside from tone.

const NETWORK_TIMEOUT = 20000;

async function fetchAndAssert(symbol: string, expectedTone: 'light' | 'dark', options: any = {}) {
  const suggestion = await suggestFmpSymbolBackground(symbol, options);
  expect(suggestion.tone).toBe(expectedTone);
  // We want at least *some* confidence (>=0) but log if very low for future tuning.
  if (suggestion.confidence < 0.05) {
    // eslint-disable-next-line no-console
    console.warn(`Low confidence for ${symbol}:`, suggestion);
  }
  return suggestion;
}

describe('FMP logo background suggestions (live)', () => {
  it('AMZN logo prefers a dark background (light foreground strokes)', async () => {
    const s = await fetchAndAssert('AMZN', 'dark', { ignorePureWhite: false });
    expect(s.foregroundSampled).toBeGreaterThanOrEqual(1);
  }, NETWORK_TIMEOUT);

  it('BRK-A logo prefers a light background (dark text)', async () => {
    const s = await fetchAndAssert('BRK-A', 'light');
    expect(s.foregroundSampled).toBeGreaterThanOrEqual(10); // Expect several dark pixels sampled
  }, NETWORK_TIMEOUT);
});
