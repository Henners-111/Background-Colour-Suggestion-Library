export interface SuggestionOptions {
  /**
   * Minimum alpha (0-255) for a pixel to be considered opaque/foreground.
   * Default 16 (~6%). Helps ignore antialiased fringes.
   */
  alphaThreshold?: number;
  /**
   * Ignore fully white pixels when determining if background should be light (useful for logos that are all-white). Default true.
   */
  ignorePureWhite?: boolean;
  /**
   * Ignore fully black pixels when determining if background should be dark. Default false.
   */
  ignorePureBlack?: boolean;
  /**
   * Percentage (0-1] of edge area sampled. 0.3 means outer 30% band (top+bottom+left+right). Default 0.4.
   * Edges are more likely to contain transparent background versus central motif.
   */
  edgeSampleRatio?: number;
}

export interface BackgroundSuggestion {
  /** 'light' or 'dark' recommendation */
  tone: 'light' | 'dark';
  /** Contrast heuristic numeric score (higher means more confidence). */
  confidence: number;
  /** Average perceived lightness (0-1) of foreground content used to decide. */
  foregroundLightness: number;
  /** Count of pixels considered foreground. */
  foregroundSampled: number;
  /** Total pixels inspected. */
  totalSampled: number;
}

export interface RGBAPixel { r: number; g: number; b: number; a: number; }

// Relative luminance per WCAG
function relativeLuminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function perceivedLightness(r: number, g: number, b: number): number {
  // HSP (perceived brightness) model scaled to 0-1
  return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b) / 255;
}

export type ImageLike = { width: number; height: number; data: Uint8Array | Uint8ClampedArray; };

/**
 * Core logic that inspects RGBA bitmap (row-major) and suggests a light or dark background.
 * Heuristics:
 * 1. Focus on non-transparent (alpha >= alphaThreshold) pixels (foreground).
 * 2. If foreground overall is light, choose dark background, and vice versa.
 * 3. If foreground is near mid-tone (0.45-0.55) analyze edge transparency to infer original background bias.
 */
export function suggestBackground(
  image: ImageLike,
  options: SuggestionOptions = {}
): BackgroundSuggestion {
  const {
    alphaThreshold = 16,
    ignorePureWhite = true,
    ignorePureBlack = false,
    edgeSampleRatio = 0.4,
  } = options;

  const { width, height } = image;
  const data = image.data;
  const totalPixels = width * height;
  const edgeBandX = Math.floor(width * edgeSampleRatio);
  const edgeBandY = Math.floor(height * edgeSampleRatio);

  let fgCount = 0;
  let accumLightness = 0;
  let pureWhiteIgnored = 0;
  let pureBlackIgnored = 0;

  // Pass 1: foreground stats
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < alphaThreshold) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (ignorePureWhite && r === 255 && g === 255 && b === 255) { pureWhiteIgnored++; continue; }
      if (ignorePureBlack && r === 0 && g === 0 && b === 0) { pureBlackIgnored++; continue; }
      const l = perceivedLightness(r, g, b);
      accumLightness += l;
      fgCount++;
    }
  }

  // Fallback if nothing foreground (treat as light -> dark background to show transparency checker style)
  if (fgCount === 0) {
    return {
      tone: 'dark',
      confidence: 0,
      foregroundLightness: 0,
      foregroundSampled: 0,
      totalSampled: totalPixels,
    };
  }

  const avgLightness = accumLightness / fgCount;

  // Mid-tone ambiguity
  let tone: 'light' | 'dark';
  let confidence: number;
  if (avgLightness > 0.58) { // fairly light foreground => dark background
    tone = 'dark';
    confidence = (avgLightness - 0.58) / 0.42; // up to 1 as it approaches 1
  } else if (avgLightness < 0.42) { // fairly dark foreground => light background
    tone = 'light';
    confidence = (0.42 - avgLightness) / 0.42;
  } else {
    // ambiguous: inspect edges for transparency bias (if edges are mostly transparent, central motif might be dark/light?)
    let edgeOpaque = 0;
    let edgeLightAccum = 0;
    for (let y = 0; y < height; y++) {
      const inYBand = y < edgeBandY || y >= height - edgeBandY;
      for (let x = 0; x < width; x++) {
        const inXBand = x < edgeBandX || x >= width - edgeBandX;
        if (!(inYBand || inXBand)) continue;
        const idx = (y * width + x) * 4;
        const a = data[idx + 3];
        if (a < alphaThreshold) continue;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const l = perceivedLightness(r, g, b);
        edgeLightAccum += l;
        edgeOpaque++;
      }
    }
    if (edgeOpaque > 0) {
      const edgeAvg = edgeLightAccum / edgeOpaque;
      if (edgeAvg > avgLightness) {
        // edges lighter than center -> likely dark logo inside -> need light background
        tone = 'light';
      } else {
        tone = 'dark';
      }
      confidence = 0.3; // low due to ambiguity
    } else {
      // default to dark background (common for mid-tone logos) with low confidence
      tone = 'dark';
      confidence = 0.1;
    }
  }

  // Clamp confidence
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    tone,
    confidence,
    foregroundLightness: avgLightness,
    foregroundSampled: fgCount,
    totalSampled: totalPixels,
  };
}

/** Convenience: load from PNG buffer (Node) using pngjs */
export async function suggestBackgroundFromPNG(buffer: Buffer, options?: SuggestionOptions): Promise<BackgroundSuggestion> {
  const { PNG } = await import('pngjs');
  const png = PNG.sync.read(buffer);
  return suggestBackground({ width: png.width, height: png.height, data: png.data }, options);
}

/**
 * Fetch a Financial Modeling Prep symbol logo (PNG) and return suggestion.
 * Example symbol: 'AMZN', 'BRK-A', 'AAPL'.
 * Optionally pass your FMP API key (when required for higher rate limits) but public logo endpoints typically work without one.
 */
export async function suggestFmpSymbolBackground(symbol: string, options?: SuggestionOptions & { apiKey?: string }) {
  const slug = encodeURIComponent(symbol.trim());
  const url = `https://images.financialmodelingprep.com/symbol/${slug}.png`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch logo for ${symbol}: ${resp.status}`);
  const arrayBuf = await resp.arrayBuffer();
  return suggestBackgroundFromPNG(Buffer.from(arrayBuf), options);
}

/**
 * High-level convenience: returns a concrete background hex color (#fff or #111 by default) plus the raw suggestion.
 * You can override the chosen light/dark colors.
 */
export async function chooseFmpSymbolBackgroundColor(
  symbol: string,
  config?: SuggestionOptions & {
    apiKey?: string;
    lightColor?: string;
    darkColor?: string;
    minConfidenceForUse?: number; // if below, return fallbackColor
    fallbackColor?: string;
  }
) {
  const {
    apiKey,
    lightColor = '#FFFFFF',
    darkColor = '#111111',
    minConfidenceForUse = 0,
    fallbackColor,
    ...opts
  } = config || {};
  const suggestion = await suggestFmpSymbolBackground(symbol, { ...opts, apiKey });
  const decided = suggestion.confidence >= minConfidenceForUse
    ? (suggestion.tone === 'dark' ? darkColor : lightColor)
    : (fallbackColor ?? lightColor);
  return { color: decided, suggestion };
}

/**
 * Browser-only helper: fetches the FMP symbol PNG into an Image element, draws it to a canvas
 * (with CORS enabled) and runs the core suggestBackground algorithm (no Node/PNG decoding).
 * This avoids the Node-only 'pngjs' dependency used in suggestBackgroundFromPNG.
 */
export async function chooseFmpSymbolBackgroundColorBrowser(
  symbol: string,
  config?: SuggestionOptions & {
    lightColor?: string;
    darkColor?: string;
    minConfidenceForUse?: number;
    fallbackColor?: string;
    onLoadImage?: (img: HTMLImageElement) => void;
  }
) {
  const {
    lightColor = '#FFFFFF',
    darkColor = '#111111',
    minConfidenceForUse = 0,
    fallbackColor,
    onLoadImage,
    ...opts
  } = config || {};

  const src = `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(symbol)}.png`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = (e) => reject(new Error(`Failed to load image for ${symbol}`));
    i.src = src + `?t=${Date.now()}`; // cache bust for demo
  });
  if (onLoadImage) onLoadImage(img);

  // Draw to canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (err) {
    throw new Error('Canvas is tainted (CORS). FMP host may not allow cross-origin pixel access.');
  }

  const suggestion = suggestBackground({ width: imageData.width, height: imageData.height, data: imageData.data }, opts);
  const decided = suggestion.confidence >= minConfidenceForUse
    ? (suggestion.tone === 'dark' ? darkColor : lightColor)
    : (fallbackColor ?? lightColor);
  return { color: decided, suggestion, src };
}

export default suggestBackground;
