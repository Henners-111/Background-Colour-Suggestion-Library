# Background Colour Suggestion Library

Suggest whether a light or dark background best showcases a (possibly transparent) logo while maintaining contrast. Focus: financial / stock logos from Financial Modeling Prep (FMP).

Common scenarios:
- AMZN: mostly white/orange foreground → needs dark background.
- BRK-A: dark blue text → needs light background.

Foreground is discovered by scanning opaque pixels; the average perceived lightness determines the recommended background tone (`light` or `dark`) with a confidence value.

---
## 1. Install

```bash
npm install background-colour-suggestion-library
# or
pnpm add background-colour-suggestion-library
```

---
## 2. Quick Start (Browser)

```ts
import suggestBackground from 'background-colour-suggestion-library';

async function run(img: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const suggestion = suggestBackground({ width: imageData.width, height: imageData.height, data: imageData.data });
  document.body.style.background = suggestion.tone === 'dark' ? '#111' : '#fff';
}
```

---
## 3. Quick Start (Node, PNG buffer)

```ts
import { readFileSync } from 'node:fs';
import { suggestBackgroundFromPNG } from 'background-colour-suggestion-library';

const buf = readFileSync('logo.png');
const suggestion = await suggestBackgroundFromPNG(buf);
console.log(suggestion);
```

---
## 4. Demo Website (Included)

A minimal demo in `demo/` shows symbols with a toggle:
- Suggested Mode: analysis + recommended background.
- Raw Mode: white background (no analysis) for comparison.

Run locally:
```bash
npm install
npm run build
node demo/server.cjs
# open http://localhost:5173
```

Add symbols: edit the `symbols` array in `demo/index.html` (e.g. `['AMZN','BRK-A','TSM','NVO']`). The demo uses the **browser** helper `chooseFmpSymbolBackgroundColorBrowser` (canvas based; no Node-only dependencies).

International tickers – test candidate URLs until one returns 200:
```
https://images.financialmodelingprep.com/symbol/TSM.png
https://images.financialmodelingprep.com/symbol/2330.TW.png
https://images.financialmodelingprep.com/symbol/NVO.png
https://images.financialmodelingprep.com/symbol/NOVO-B.CO.png
```

---
## 5. API

### `suggestBackground(image, options?)`
Analyze RGBA data.

Options:
- `alphaThreshold` (default 16)
- `ignorePureWhite` (default true)
- `ignorePureBlack` (default false)
- `edgeSampleRatio` (default 0.4)

Returns `BackgroundSuggestion`:
- `tone`, `confidence`, `foregroundLightness`, `foregroundSampled`, `totalSampled`

### `suggestBackgroundFromPNG(buffer, options?)`
Node helper (uses `pngjs`) to decode PNG then analyze.

### `suggestFmpSymbolBackground(symbol, options?)`
Node-side fetch + PNG decode for an FMP logo.

### `chooseFmpSymbolBackgroundColor(symbol, config?)`
Node high-level helper returning `{ color, suggestion }`.
Config fields: `lightColor`, `darkColor`, `minConfidenceForUse`, `fallbackColor`.

### `chooseFmpSymbolBackgroundColorBrowser(symbol, config?)`
Browser canvas version (no `pngjs`). Returns `{ color, suggestion, src }`.

#### Client Example
```ts
import { chooseFmpSymbolBackgroundColorBrowser } from 'background-colour-suggestion-library';

async function applyLogoBackground(symbol: string) {
  const { color, suggestion } = await chooseFmpSymbolBackgroundColorBrowser(symbol, {
    ignorePureWhite: false,
    minConfidenceForUse: 0.1,
    darkColor: '#111111',
    lightColor: '#FFFFFF'
  });
  const el = document.querySelector('.stock-logo-wrapper') as HTMLElement;
  el.style.background = color;
  el.dataset.bgTone = suggestion.tone;
  el.dataset.bgConfidence = suggestion.confidence.toFixed(3);
}
```

### `BackgroundSuggestion`
| Field | Description |
|-------|-------------|
| `tone` | 'light' | 'dark' |
| `confidence` | 0–1 heuristic score |
| `foregroundLightness` | mean perceived lightness (0–1) |
| `foregroundSampled` | number of sampled foreground pixels |
| `totalSampled` | total pixels scanned |

---

## 6. Integrating on an FMP Symbol Page
Workflow:
1. Logo URL: `https://images.financialmodelingprep.com/symbol/<SYMBOL>.png`
2. Run browser or Node helper for `{ color, suggestion }`.
3. Apply `color` to wrapper.
4. Cache per symbol.
5. Fallback to default theme if `confidence < 0.1`.

React hook sketch:
```ts
import { chooseFmpSymbolBackgroundColorBrowser } from 'background-colour-suggestion-library';
import { useEffect, useState } from 'react';

export function useLogoBackground(symbol: string) {
  const [state, set] = useState({ color:'#fff', tone:'light', loading:true });
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { color, suggestion } = await chooseFmpSymbolBackgroundColorBrowser(symbol, { ignorePureWhite:false });
        if (!cancel) set({ color, tone: suggestion.tone, loading:false });
      } catch {
        if (!cancel) set({ color:'#fff', tone:'light', loading:false });
      }
    })();
    return () => { cancel = true; };
  }, [symbol]);
  return state;
}
```