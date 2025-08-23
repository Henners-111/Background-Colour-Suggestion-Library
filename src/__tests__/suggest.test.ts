/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import suggestBackground from '../index.js';

function makeImage(pixels: number[], width: number, height: number) {
  // pixels: flat array of RGBA (0-255)
  return { width, height, data: Uint8ClampedArray.from(pixels) };
}

describe('suggestBackground', () => {
  it('recommends dark background for light logo', () => {
    // Light foreground (near white) strokes
    const pixels = [] as number[];
    for (let i = 0; i < 4; i++) { pixels.push(240, 240, 240, 255); }
    const img = makeImage(pixels, 2, 2);
    const res = suggestBackground(img, { ignorePureWhite: false });
    expect(res.tone).toBe('dark');
  });

  it('recommends light background for dark logo', () => {
    const pixels = [] as number[];
    for (let i = 0; i < 4; i++) { pixels.push(10, 10, 10, 255); }
    const img = makeImage(pixels, 2, 2);
    const res = suggestBackground(img);
    expect(res.tone).toBe('light');
  });

  it('ignores transparent pixels', () => {
    const pixels = [
      0,0,0,0, 0,0,0,0,
      250,250,250,255, 250,250,250,255
    ];
    const img = makeImage(pixels, 2, 2);
    const res = suggestBackground(img);
    expect(res.foregroundSampled).toBe(2);
  });
});
