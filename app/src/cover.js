'use strict';
/*
 * NEON COAST — Vice Cover Studio: cover rendering engine.
 *
 * Pure canvas work, no dependencies, fully offline. Turns photos into
 * inked poster art (gradient map -> saturation lift -> posterize -> Sobel
 * ink edges), lays them out as GTA-style covers and finishes every render
 * with a sunset-gradient title, neon subtitle, heat-meter stars, a round
 * badge, film grain and a vignette.
 */

/* ------------------------------------------------------------------ */
/* Photo library: 6 generated assets + 2 kit starter samples.          */
/* ------------------------------------------------------------------ */
const PHOTO_LIBRARY = [
  { id: 'hero', src: 'assets/hero.jpg', label: 'Hero Boulevard' },
  { id: 'rooftop', src: 'assets/rooftop.jpg', label: 'Rooftop Dusk' },
  { id: 'carfriends', src: 'assets/carfriends.jpg', label: 'Car Friends' },
  { id: 'pool', src: 'assets/pool.jpg', label: 'Pool Dusk' },
  { id: 'beachdrive', src: 'assets/beachdrive.jpg', label: 'Beach Drive' },
  { id: 'marina', src: 'assets/marina.jpg', label: 'Marina Nights' },
  { id: 'boulevard', src: 'samples/boulevard.jpg', label: 'Boulevard Sample' },
  { id: 'pier', src: 'samples/pier.jpg', label: 'Pier Sample' },
];

/* ------------------------------------------------------------------ */
/* Grades: gradient-map stops (luminance 0..1 -> hex), saturation,     */
/* blend of map vs. saturated photo, posterize levels, Sobel ink.      */
/* ------------------------------------------------------------------ */
const GRADES = {
  posterInk: {
    label: 'Poster Ink',
    stops: [[0, '#1a0b2e'], [0.28, '#57298f'], [0.5, '#c22e7a'], [0.72, '#f0643c'], [0.88, '#f7a83c'], [1, '#ffe9a8']],
    saturation: 1.35, blend: 0.85, posterizeLevels: 6,
    ink: { threshold: 140, alphaFull: 0.46, alphaPartial: 0.27, color: [16, 6, 30] },
  },
  sunsetPoster: {
    label: 'Sunset Poster',
    stops: [[0, '#241028'], [0.35, '#7a2d6d'], [0.6, '#e0524d'], [0.82, '#f68c3c'], [1, '#ffd98a']],
    saturation: 1.2, blend: 0.7, posterizeLevels: 5,
    ink: { threshold: 170, alphaFull: 0.25, alphaPartial: 0.12, color: [24, 8, 20] },
  },
  neonNights: {
    label: 'Neon Nights',
    stops: [[0, '#050914'], [0.3, '#0d2b5c'], [0.55, '#0e7d9c'], [0.78, '#d63384'], [1, '#e8fbff']],
    saturation: 1.45, blend: 0.8, posterizeLevels: 0, ink: null,
  },
  goldenHour: {
    label: 'Golden Hour',
    stops: [[0, '#2a1608'], [0.35, '#8a5a1e'], [0.62, '#d99a3c'], [0.85, '#f2c96b'], [1, '#fdf0c0']],
    saturation: 1.15, blend: 0.55, posterizeLevels: 0, ink: null,
  },
  viceChrome: {
    label: 'Vice Chrome',
    stops: [[0, '#0a2030'], [0.3, '#14667a'], [0.55, '#7fb6c9'], [0.78, '#e88bb0'], [1, '#fdfdfd']],
    saturation: 0.9, blend: 0.65, posterizeLevels: 8,
    ink: { threshold: 165, alphaFull: 0.3, alphaPartial: 0.15, color: [8, 16, 26] },
  },
  monoInk: {
    label: 'Mono Ink',
    stops: [[0, '#000000'], [1, '#ffffff']],
    saturation: 0, blend: 1, posterizeLevels: 6,
    ink: { threshold: 110, alphaFull: 0.7, alphaPartial: 0.4, color: [10, 10, 14] },
  },
  candyPop: {
    label: 'Candy Pop',
    stops: [[0, '#3b1155'], [0.3, '#a04fd6'], [0.55, '#ff6fa5'], [0.78, '#ffb3c9'], [0.92, '#a8e6d5'], [1, '#fff7d6']],
    saturation: 1.5, blend: 0.7, posterizeLevels: 0, ink: null,
  },
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* Build a 256-entry gradient-map lookup table for a grade. */
function buildGradientLut(grade) {
  const lut = new Uint8Array(256 * 3);
  const stops = grade.stops;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0], b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const span = (b[0] - a[0]) || 1;
    const f = Math.min(1, Math.max(0, (t - a[0]) / span));
    const ca = hexToRgb(a[1]), cb = hexToRgb(b[1]);
    lut[i * 3] = ca[0] + (cb[0] - ca[0]) * f;
    lut[i * 3 + 1] = ca[1] + (cb[1] - ca[1]) * f;
    lut[i * 3 + 2] = ca[2] + (cb[2] - ca[2]) * f;
  }
  return lut;
}

const gradientLutCache = new Map();
function gradientLutFor(gradeId) {
  if (!gradientLutCache.has(gradeId)) gradientLutCache.set(gradeId, buildGradientLut(GRADES[gradeId]));
  return gradientLutCache.get(gradeId);
}

function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function posterizeChannel(v, levels) {
  if (!levels) return v;
  const step = 255 / (levels - 1);
  return Math.round(v / step) * step;
}

/*
 * Sobel ink edges: darken pixels whose luminance gradient is strong.
 * Full-strength ink above the grade's threshold, partial ink in a band
 * below it, so faces keep soft modelling and only real contours ink.
 */
function applySobelInkEdges(data, width, height, luminance, ink) {
  const partialBand = ink.threshold * 0.55;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = -luminance[i - width - 1] - 2 * luminance[i - 1] - luminance[i + width - 1]
        + luminance[i - width + 1] + 2 * luminance[i + 1] + luminance[i + width + 1];
      const gy = -luminance[i - width - 1] - 2 * luminance[i - width] - luminance[i - width + 1]
        + luminance[i + width - 1] + 2 * luminance[i + width] + luminance[i + width + 1];
      const magnitude = Math.abs(gx) + Math.abs(gy);
      let alpha = 0;
      if (magnitude > ink.threshold) alpha = ink.alphaFull;
      else if (magnitude > partialBand) alpha = ink.alphaPartial;
      if (alpha > 0) {
        const o = i * 4;
        data[o] = data[o] * (1 - alpha) + ink.color[0] * alpha;
        data[o + 1] = data[o + 1] * (1 - alpha) + ink.color[1] * alpha;
        data[o + 2] = data[o + 2] * (1 - alpha) + ink.color[2] * alpha;
      }
    }
  }
}

/*
 * The Poster Ink pipeline, shared by every grade: gradient map, then a
 * saturation lift blended back in, then posterize, then Sobel ink.
 */
function applyGradePipeline(imageData, gradeId) {
  const grade = GRADES[gradeId];
  const lut = gradientLutFor(gradeId);
  const data = imageData.data;
  const width = imageData.width, height = imageData.height;
  const luminance = new Float32Array(width * height);
  const sat = grade.saturation, blend = grade.blend, keep = 1 - blend;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const li = lum | 0;
    let nr = posterizeChannel(clampByte((lum + (r - lum) * sat) * keep + lut[li * 3] * blend), grade.posterizeLevels);
    let ng = posterizeChannel(clampByte((lum + (g - lum) * sat) * keep + lut[li * 3 + 1] * blend), grade.posterizeLevels);
    let nb = posterizeChannel(clampByte((lum + (b - lum) * sat) * keep + lut[li * 3 + 2] * blend), grade.posterizeLevels);
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
    luminance[p] = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
  }
  if (grade.ink) applySobelInkEdges(data, width, height, luminance, grade.ink);
  return imageData;
}

/*
 * Graded photo cache: grade each source photo once per grade (capped at
 * 1600px on the long side) so panel dragging and re-layouts stay fast;
 * panels then draw cover-fit crops of the graded canvas.
 */
const gradedPhotoCache = new Map();
function gradedPhotoCanvas(img, gradeId) {
  const key = (img.currentSrc || img.src) + '|' + gradeId;
  if (gradedPhotoCache.has(key)) return gradedPhotoCache.get(key);
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(2, Math.round(img.naturalWidth * scale));
  const h = Math.max(2, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  applyGradePipeline(imageData, gradeId);
  ctx.putImageData(imageData, 0, 0);
  gradedPhotoCache.set(key, canvas);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Panel drawing                                                       */
/* ------------------------------------------------------------------ */

/* Cover-fit draw of a graded photo into a panel rect, honouring the
 * panel view (dx/dy pan in cover px, zoom >= 1), clamped so the photo
 * always covers the panel. */
function drawPhotoIntoPanel(ctx, rect, panel, gradeId) {
  const graded = gradedPhotoCanvas(panel.img, gradeId);
  const iw = graded.width, ih = graded.height;
  // A layout may bias a panel's default crop (rect.zoomBias) so its
  // hero panel starts tighter than a plain cover-fit.
  const scale = Math.max(rect.w / iw, rect.h / ih) * (panel.zoom || 1) * (rect.zoomBias || 1);
  const dw = iw * scale, dh = ih * scale;
  let dx = rect.x + (rect.w - dw) / 2 + (panel.dx || 0);
  let dy = rect.y + (rect.h - dh) / 2 + (panel.dy || 0);
  dx = Math.min(rect.x, Math.max(rect.x + rect.w - dw, dx));
  dy = Math.min(rect.y, Math.max(rect.y + rect.h - dh, dy));
  ctx.drawImage(graded, dx, dy, dw, dh);
}

function strokePanelBorder(ctx, rect, lineWidth) {
  ctx.strokeStyle = 'rgba(5, 2, 12, 0.85)';
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}

/* Draw one photo panel, with a white snapshot frame + rotation when the
 * layout asks for a tilted shot. */
function paintPhotoPanel(ctx, rect, panel, gradeId, coverWidth) {
  const border = Math.max(2, coverWidth * 0.0025);
  ctx.save();
  if (rect.tilt) {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rect.tilt * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    const pad = rect.w * 0.035;
    ctx.fillStyle = '#f7f2e7';
    ctx.fillRect(rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2);
  }
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  drawPhotoIntoPanel(ctx, rect, panel, gradeId);
  ctx.restore();
  ctx.save();
  if (rect.tilt) {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rect.tilt * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  strokePanelBorder(ctx, rect, border);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Decorations: halftone, title, subtitle, stars, badge, grain         */
/* ------------------------------------------------------------------ */

function paintHalftoneBand(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#2a0a4a');
  grad.addColorStop(1, '#170630');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  const spacing = Math.max(10, w * 0.011);
  const rows = Math.ceil(h / spacing);
  for (let row = 0; row < rows; row++) {
    const radius = 1 + 3.4 * (rows <= 1 ? 1 : row / (rows - 1));
    ctx.fillStyle = 'rgba(255, 110, 199, 0.26)';
    for (let cx = x + (row % 2 ? spacing / 2 : 0); cx < x + w; cx += spacing) {
      ctx.beginPath();
      ctx.arc(cx, y + row * spacing + spacing / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(64, 224, 255, 0.10)';
  for (let row = 0; row < rows; row++) {
    for (let cx = x + spacing / 2; cx < x + w; cx += spacing * 2) {
      ctx.beginPath();
      ctx.arc(cx, y + row * spacing + spacing / 2, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSunsetTitle(ctx, text, cx, cy, size) {
  ctx.save();
  ctx.font = `900 ${size}px 'Arial Black', 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = `${Math.round(size * 0.02)}px`; } catch (e) { /* older canvas */ }
  const grad = ctx.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
  grad.addColorStop(0, '#ffd23f');
  grad.addColorStop(0.38, '#ff7b39');
  grad.addColorStop(0.68, '#ff3d8a');
  grad.addColorStop(1, '#7b2ff7');
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.15;
  ctx.strokeStyle = '#190826';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = size * 0.09;
  ctx.shadowOffsetY = size * 0.045;
  ctx.strokeText(text, cx, cy);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

function drawNeonSubtitle(ctx, text, cx, cy, size) {
  if (!text) return;
  ctx.save();
  ctx.font = `italic 700 ${size}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff3d8a';
  ctx.shadowBlur = size * 0.55;
  ctx.fillStyle = '#ffd7ef';
  ctx.fillText(text, cx, cy);
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = size * 0.4;
  ctx.fillStyle = '#a5f3fc';
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(angle) * radius, py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawHeatStarMeter(ctx, cx, cy, r, count = 5) {
  ctx.save();
  const spacing = r * 2.45;
  const startX = cx - ((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    const grad = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    grad.addColorStop(0, '#ffe259');
    grad.addColorStop(1, '#f39c2c');
    starPath(ctx, startX + i * spacing, cy, r);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = '#7a4d00';
    ctx.stroke();
  }
  ctx.restore();
}

/* Round badge, ~60px radius on a 1280-wide cover, thin gold ring. */
function stampRoundBadge(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(14, 5, 26, 0.9)';
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.strokeStyle = '#ffc93f';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.025);
  ctx.strokeStyle = 'rgba(255, 201, 63, 0.55)';
  ctx.stroke();
  starPath(ctx, cx, cy - r * 0.44, r * 0.17);
  ctx.fillStyle = '#ffc93f';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe9a8';
  ctx.font = `800 ${r * 0.235}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillText('NEON COAST', cx, cy - r * 0.02);
  ctx.fillStyle = '#f5e9c9';
  ctx.font = `600 ${r * 0.21}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillText('EST. 2026', cx, cy + r * 0.3);
  ctx.restore();
}

let grainTile = null;
function applyFilmGrain(ctx, w, h) {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = 256; grainTile.height = 256;
    const g = grainTile.getContext('2d');
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 96 + Math.random() * 64;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grainTile, 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function applyVignette(ctx, w, h) {
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
  grad.addColorStop(0, 'rgba(8, 2, 16, 0)');
  grad.addColorStop(1, 'rgba(8, 2, 16, 0.5)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function paintScrim(ctx, x, y, w, h, fromTop) {
  const grad = fromTop
    ? ctx.createLinearGradient(0, y, 0, y + h)
    : ctx.createLinearGradient(0, y + h, 0, y);
  grad.addColorStop(0, 'rgba(16, 3, 30, 0.62)');
  grad.addColorStop(1, 'rgba(16, 3, 30, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

/* ------------------------------------------------------------------ */
/* Layouts. Every layout's photo panels are filled with DISTINCT       */
/* photos — no photo ever appears twice in one cover. The mosaic's     */
/* centre panel is a graphic title block, not a photo.                 */
/* ------------------------------------------------------------------ */
const TITLE_BLOCK_RATIO = { quadDistinct: 0.2, classicBlock: 0.22 };
const MOSAIC_BAND_RATIO = 0.15;

const LAYOUTS = [
  { id: 'heroSpread', label: 'Hero Spread', photoPanels: 1 },
  { id: 'posterGrid', label: 'Poster Grid', photoPanels: 5 },
  { id: 'quadDistinct', label: 'Quad — 4 Distinct', photoPanels: 4 },
  { id: 'tiltedShots', label: 'Tilted Snapshots', photoPanels: 3 },
  { id: 'mosaic9', label: 'Mosaic 9', photoPanels: 8 },
  { id: 'duoSplit', label: 'Duo Split', photoPanels: 2 },
  { id: 'triptych', label: 'Triptych', photoPanels: 3 },
  { id: 'classicBlock', label: 'Classic Title Block', photoPanels: 3 },
];

const EXPORT_SIZES = {
  square: { label: 'Square 1080×1080', w: 1080, h: 1080 },
  portrait: { label: 'Portrait 1080×1350', w: 1080, h: 1350 },
  wide: { label: 'Wide 1920×1080', w: 1920, h: 1080 },
  story: { label: 'Story 1080×1920', w: 1080, h: 1920 },
};

/* Photo panel rects (in draw order) for a layout at cover size W×H. */
function layoutPanels(layoutId, W, H) {
  const g = Math.max(4, W * 0.012);
  switch (layoutId) {
    case 'heroSpread':
      return [{ x: 0, y: 0, w: W, h: H }];
    case 'posterGrid': {
      // Asymmetric GTA poster: one tall panel on the left (~40% of the
      // width), a 2x2 grid on the right, white gutters between them
      // (the cover background shows through, painted cream for this
      // layout in renderCover). The gutters run wider than the other
      // layouts' gaps — the bold white separation IS the poster look.
      // Draw order: tall, then the grid row by row.
      const pg = Math.max(6, Math.round(W * 0.016));
      const leftW = Math.round((W - pg * 3) * 0.4);
      const rightX = pg * 2 + leftW;
      const cellW = (W - rightX - pg * 2) / 2;
      const cellH = (H - pg * 3) / 2;
      return [
        { x: pg, y: pg, w: leftW, h: H - pg * 2, zoomBias: 1.08 },
        { x: rightX, y: pg, w: cellW, h: cellH },
        { x: rightX + cellW + pg, y: pg, w: cellW, h: cellH },
        { x: rightX, y: pg * 2 + cellH, w: cellW, h: cellH },
        { x: rightX + cellW + pg, y: pg * 2 + cellH, w: cellW, h: cellH },
      ];
    }
    case 'quadDistinct': {
      const top = H * TITLE_BLOCK_RATIO.quadDistinct;
      const cw = (W - g * 3) / 2, ch = (H - top - g * 3) / 2;
      return [
        { x: g, y: top + g, w: cw, h: ch }, { x: g * 2 + cw, y: top + g, w: cw, h: ch },
        { x: g, y: top + g * 2 + ch, w: cw, h: ch }, { x: g * 2 + cw, y: top + g * 2 + ch, w: cw, h: ch },
      ];
    }
    case 'tiltedShots': {
      const pw = W * 0.54, ph = H * 0.5;
      return [
        { x: W * 0.05, y: H * 0.3, w: pw, h: ph, tilt: -5 },
        { x: W * 0.42, y: H * 0.24, w: pw, h: ph, tilt: 3.5 },
        { x: W * 0.23, y: H * 0.52, w: pw, h: ph, tilt: -2 },
      ];
    }
    case 'mosaic9': {
      const cw = (W - g * 4) / 3, ch = (H - g * 4) / 3;
      const rects = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (row === 1 && col === 1) continue; // centre = title block
          rects.push({ x: g + col * (cw + g), y: g + row * (ch + g), w: cw, h: ch });
        }
      }
      return rects;
    }
    case 'duoSplit':
      return [
        { x: 0, y: 0, w: W * 0.55, h: H },
        { x: W * 0.55, y: 0, w: W * 0.45, h: H },
      ];
    case 'triptych': {
      const cw = (W - g * 4) / 3;
      return [0, 1, 2].map((i) => ({ x: g + i * (cw + g), y: g, w: cw, h: H - g * 2 }));
    }
    case 'classicBlock': {
      const top = H * TITLE_BLOCK_RATIO.classicBlock;
      const cw = (W - g * 4) / 3;
      return [0, 1, 2].map((i) => ({ x: g + i * (cw + g), y: top + g, w: cw, h: H - top - g * 2 }));
    }
    default:
      return [{ x: 0, y: 0, w: W, h: H }];
  }
}

function mosaicCentreRect(W, H) {
  const g = Math.max(4, W * 0.012);
  const cw = (W - g * 4) / 3, ch = (H - g * 4) / 3;
  return { x: g + (cw + g), y: g + (ch + g), w: cw, h: ch };
}

function paintMosaicCentre(ctx, W, H, state) {
  const rect = mosaicCentreRect(W, H);
  paintHalftoneBand(ctx, rect.x, rect.y, rect.w, rect.h);
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 201, 63, 0.8)';
  ctx.lineWidth = Math.max(2, W * 0.0025);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  const words = (state.title || 'NEON COAST').split(' ');
  const size = rect.w * 0.17;
  words.forEach((word, i) => {
    drawSunsetTitle(ctx, word, rect.x + rect.w / 2, rect.y + rect.h * (words.length > 1 ? 0.3 + i * 0.26 : 0.38), size);
  });
  drawHeatStarMeter(ctx, rect.x + rect.w / 2, rect.y + rect.h * 0.86, rect.w * 0.045);
  ctx.restore();
}

/* Title treatment per layout: sunset-gradient title, neon subtitle,
 * heat-meter stars, round badge. */
function drawCoverTitle(ctx, W, H, state) {
  const badgeR = W * 0.047;
  switch (state.layout) {
    case 'heroSpread': {
      paintScrim(ctx, 0, 0, W, H * 0.42, true);
      drawSunsetTitle(ctx, state.title, W / 2, H * 0.115, H * 0.15);
      drawNeonSubtitle(ctx, state.subtitle, W / 2, H * 0.225, H * 0.05);
      drawHeatStarMeter(ctx, W / 2, H * 0.285, H * 0.016);
      stampRoundBadge(ctx, W - badgeR - W * 0.028, H - badgeR - H * 0.045, badgeR);
      break;
    }
    case 'posterGrid': {
      // Title block rides over the top of the panel grid, GTA-poster
      // style: scrim, gradient title, neon subtitle, heat stars, badge
      // in the bottom-right corner panel.
      paintScrim(ctx, 0, 0, W, H * 0.4, true);
      drawSunsetTitle(ctx, state.title, W / 2, H * 0.098, H * 0.135);
      drawNeonSubtitle(ctx, state.subtitle, W / 2, H * 0.19, H * 0.048);
      drawHeatStarMeter(ctx, W / 2, H * 0.245, H * 0.015);
      stampRoundBadge(ctx, W - badgeR - W * 0.025, H - badgeR - H * 0.04, badgeR);
      break;
    }
    case 'quadDistinct':
    case 'classicBlock': {
      const blockH = H * TITLE_BLOCK_RATIO[state.layout];
      paintHalftoneBand(ctx, 0, 0, W, blockH);
      drawSunsetTitle(ctx, state.title, W / 2, blockH * 0.4, blockH * 0.42);
      drawNeonSubtitle(ctx, state.subtitle, W / 2, blockH * 0.76, blockH * 0.19);
      drawHeatStarMeter(ctx, W - W * 0.098, blockH / 2, blockH * 0.066);
      stampRoundBadge(ctx, badgeR + W * 0.02, blockH / 2, Math.min(badgeR, blockH * 0.36));
      break;
    }
    case 'mosaic9': {
      const bandH = H * MOSAIC_BAND_RATIO;
      ctx.save();
      ctx.globalAlpha = 0.94;
      paintHalftoneBand(ctx, 0, 0, W, bandH);
      ctx.restore();
      drawSunsetTitle(ctx, state.title, W / 2, bandH * 0.42, bandH * 0.5);
      drawNeonSubtitle(ctx, state.subtitle, W / 2, bandH * 0.8, bandH * 0.2);
      drawHeatStarMeter(ctx, W * 0.07, bandH / 2, bandH * 0.08);
      stampRoundBadge(ctx, W - badgeR - W * 0.02, H - badgeR - H * 0.03, badgeR);
      break;
    }
    case 'tiltedShots': {
      drawSunsetTitle(ctx, state.title, W / 2, H * 0.085, H * 0.1);
      drawNeonSubtitle(ctx, state.subtitle, W / 2, H * 0.155, H * 0.042);
      drawHeatStarMeter(ctx, W / 2, H * 0.2, H * 0.014);
      stampRoundBadge(ctx, W - badgeR - W * 0.025, H - badgeR - H * 0.03, badgeR);
      break;
    }
    case 'duoSplit': {
      paintScrim(ctx, 0, H * 0.58, W, H * 0.42, false);
      drawSunsetTitle(ctx, state.title, W / 2, H * 0.8, H * 0.115);
      drawNeonSubtitle(ctx, state.subtitle, W / 2, H * 0.885, H * 0.045);
      drawHeatStarMeter(ctx, W / 2, H * 0.94, H * 0.014);
      stampRoundBadge(ctx, W - badgeR - W * 0.025, badgeR + H * 0.035, badgeR);
      break;
    }
    case 'triptych': {
      paintScrim(ctx, 0, 0, W, H * 0.3, true);
      drawSunsetTitle(ctx, state.title, W / 2, H * 0.075, H * 0.095);
      drawNeonSubtitle(ctx, state.subtitle, W / 2, H * 0.135, H * 0.04);
      drawHeatStarMeter(ctx, W / 2, H * 0.175, H * 0.013);
      stampRoundBadge(ctx, W - badgeR - W * 0.025, H - badgeR - H * 0.03, badgeR);
      break;
    }
    default:
      drawSunsetTitle(ctx, state.title, W / 2, H * 0.12, H * 0.13);
  }
}

/*
 * Render a full cover into a canvas.
 * state = { title, subtitle, layout, grade, panels: [{img, dx, dy, zoom}] }
 */
function renderCover(canvas, state) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  // The poster grid's gutters are the background showing between the
  // panels, so that layout paints its ground cream-white, not dark.
  ctx.fillStyle = state.layout === 'posterGrid' ? '#f7f2e7' : '#0c0614';
  ctx.fillRect(0, 0, W, H);
  if (state.layout === 'tiltedShots') {
    const glow = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, Math.max(W, H) * 0.7);
    glow.addColorStop(0, 'rgba(88, 28, 135, 0.5)');
    glow.addColorStop(1, 'rgba(8, 2, 16, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }
  const rects = layoutPanels(state.layout, W, H);
  rects.forEach((rect, i) => {
    const panel = state.panels[i];
    if (panel && panel.img) paintPhotoPanel(ctx, rect, panel, state.grade, W);
  });
  if (state.layout === 'mosaic9') paintMosaicCentre(ctx, W, H, state);
  drawCoverTitle(ctx, W, H, state);
  applyFilmGrain(ctx, W, H);
  applyVignette(ctx, W, H);
  return canvas;
}

window.CoverArt = {
  PHOTO_LIBRARY,
  GRADES,
  LAYOUTS,
  EXPORT_SIZES,
  layoutPanels,
  renderCover,
  gradedPhotoCanvas,
};
