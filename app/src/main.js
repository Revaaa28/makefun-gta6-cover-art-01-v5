'use strict';
/*
 * NEON COAST — Vice Cover Studio: editor wiring.
 *
 * State is a list of photo panels per layout; every panel always holds a
 * DIFFERENT photo (assigning an in-use photo swaps the two panels, the
 * hero layout holds one photo, the mosaic's centre is a title block).
 * All rendering goes through CoverArt.CA.renderCover.
 */
const CA = window.CoverArt; // cover.js owns the global names; go through the namespace

const DEFAULT_PHOTOS = {
  heroSpread: ['hero'],
  quadDistinct: ['beachdrive', 'pool', 'pier', 'boulevard'],
  tiltedShots: ['rooftop', 'carfriends', 'marina'],
  mosaic9: ['hero', 'rooftop', 'carfriends', 'pool', 'beachdrive', 'marina', 'boulevard', 'pier'],
  duoSplit: ['hero', 'beachdrive'],
  triptych: ['rooftop', 'hero', 'marina'],
  classicBlock: ['carfriends', 'pool', 'boulevard'],
};

const canvas = document.getElementById('coverCanvas');
const titleInput = document.getElementById('titleInput');
const subtitleInput = document.getElementById('subtitleInput');
const libraryEl = document.getElementById('library');
const layoutPickerEl = document.getElementById('layoutPicker');
const gradePickerEl = document.getElementById('gradePicker');
const sizeSelect = document.getElementById('sizeSelect');
const uploadInput = document.getElementById('uploadInput');

const photoImages = new Map(); // photoId -> HTMLImageElement
const photoLabels = new Map(); // photoId -> label
let uploadCount = 0;

const state = {
  title: 'NEON COAST',
  subtitle: 'Sunset Heist',
  layout: 'heroSpread',
  grade: 'posterInk',
  exportSize: 'wide',
  panels: [], // [{ photoId, img, dx, dy, zoom }]
  selected: 0,
};

function makePanel(photoId) {
  return { photoId, img: photoImages.get(photoId), dx: 0, dy: 0, zoom: 1 };
}

function setLayoutPhotos(layoutId, photoIds) {
  state.panels = photoIds.map(makePanel);
  state.selected = 0;
}

/* ---------------- history (undo / redo) ---------------- */
const undoStack = [];
const redoStack = [];

function snapshotState() {
  return JSON.stringify({
    title: state.title,
    subtitle: state.subtitle,
    layout: state.layout,
    grade: state.grade,
    exportSize: state.exportSize,
    selected: state.selected,
    panels: state.panels.map((p) => ({ photoId: p.photoId, dx: p.dx, dy: p.dy, zoom: p.zoom })),
  });
}

function restoreSnapshot(json) {
  const s = JSON.parse(json);
  state.title = s.title;
  state.subtitle = s.subtitle;
  state.layout = s.layout;
  state.grade = s.grade;
  state.exportSize = s.exportSize;
  state.selected = s.selected;
  state.panels = s.panels
    .filter((p) => photoImages.has(p.photoId))
    .map((p) => ({ photoId: p.photoId, img: photoImages.get(p.photoId), dx: p.dx, dy: p.dy, zoom: p.zoom }));
  syncControlsFromState();
  render();
}

function pushHistory() {
  undoStack.push(snapshotState());
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  syncHistoryButtons();
}

function syncHistoryButtons() {
  document.getElementById('undoBtn').disabled = undoStack.length === 0;
  document.getElementById('redoBtn').disabled = redoStack.length === 0;
}

/* ---------------- rendering ---------------- */
function render() {
  const size = CA.EXPORT_SIZES[state.exportSize];
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  CA.renderCover(canvas, state);
  markInUseThumbs();
}

function panelRects() {
  return CA.layoutPanels(state.layout, canvas.width, canvas.height);
}

/* ---------------- library strip ---------------- */
function addLibraryThumb(photoId) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.photoId = photoId;
  btn.title = photoLabels.get(photoId) || photoId;
  const img = document.createElement('img');
  img.src = photoImages.get(photoId).src;
  img.alt = btn.title;
  btn.appendChild(img);
  btn.addEventListener('click', () => assignPhotoToSelected(photoId));
  libraryEl.appendChild(btn);
}

function markInUseThumbs() {
  const used = new Set(state.panels.map((p) => p.photoId));
  libraryEl.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('in-use', used.has(btn.dataset.photoId));
  });
}

/* Assign a photo to the selected panel; if another panel already shows
 * it, swap the two panels so no cover ever repeats a photo. */
function assignPhotoToSelected(photoId) {
  if (!state.panels.length) return;
  const target = state.selected;
  const other = state.panels.findIndex((p, i) => i !== target && p.photoId === photoId);
  pushHistory();
  if (other >= 0) {
    const displaced = state.panels[target].photoId;
    state.panels[other] = makePanel(displaced);
    state.panels[other].dx = state.panels[target].dx;
    state.panels[other].dy = state.panels[target].dy;
  }
  state.panels[target] = makePanel(photoId);
  render();
}

/* ---------------- pickers ---------------- */
function buildPicker(el, items, getActive, onPick) {
  el.innerHTML = '';
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    btn.dataset.id = item.id;
    if (item.id === getActive()) btn.classList.add('active');
    btn.addEventListener('click', () => onPick(item.id));
    el.appendChild(btn);
  });
}

function refreshPickers() {
  buildPicker(layoutPickerEl, CA.LAYOUTS, () => state.layout, (id) => {
    if (id === state.layout) return;
    pushHistory();
    state.layout = id;
    setLayoutPhotos(id, DEFAULT_PHOTOS[id]);
    render();
  });
  buildPicker(gradePickerEl, Object.entries(CA.GRADES).map(([id, g]) => ({ id, label: g.label })), () => state.grade, (id) => {
    if (id === state.grade) return;
    pushHistory();
    state.grade = id;
    render();
  });
}

function syncControlsFromState() {
  titleInput.value = state.title;
  subtitleInput.value = state.subtitle;
  sizeSelect.value = state.exportSize;
  refreshPickers();
  syncHistoryButtons();
}

/* ---------------- canvas interaction ---------------- */
function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * canvas.width,
    y: ((evt.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function panelIndexAt(point) {
  const rects = panelRects();
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return i;
  }
  return -1;
}

let drag = null;
canvas.addEventListener('pointerdown', (evt) => {
  const point = canvasPoint(evt);
  const idx = panelIndexAt(point);
  if (idx < 0) return;
  if (idx !== state.selected) {
    state.selected = idx;
    render();
  }
  drag = { x: point.x, y: point.y, moved: false, before: snapshotState() };
  canvas.setPointerCapture(evt.pointerId);
});

canvas.addEventListener('pointermove', (evt) => {
  if (!drag) return;
  const point = canvasPoint(evt);
  const panel = state.panels[state.selected];
  if (!panel) return;
  const dx = point.x - drag.x, dy = point.y - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
  panel.dx += dx;
  panel.dy += dy;
  drag.x = point.x;
  drag.y = point.y;
  render();
});

canvas.addEventListener('pointerup', () => {
  if (drag && drag.moved) {
    undoStack.push(drag.before);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    syncHistoryButtons();
  }
  drag = null;
});

canvas.addEventListener('wheel', (evt) => {
  const idx = panelIndexAt(canvasPoint(evt));
  if (idx < 0) return;
  evt.preventDefault();
  if (idx !== state.selected) state.selected = idx;
  const panel = state.panels[state.selected];
  if (!panel) return;
  pushHistory();
  panel.zoom = Math.min(4, Math.max(1, panel.zoom * Math.exp(-evt.deltaY * 0.0012)));
  render();
}, { passive: false });

/* ---------------- actions ---------------- */
function shufflePhotos() {
  if (state.panels.length < 2) return;
  pushHistory();
  const ids = state.panels.map((p) => p.photoId);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  state.panels = ids.map(makePanel);
  render();
}

/* Spread: the selected panel's photo fills the whole cover (hero). */
function spreadPhoto() {
  const panel = state.panels[state.selected];
  if (!panel) return;
  pushHistory();
  state.layout = 'heroSpread';
  setLayoutPhotos('heroSpread', [panel.photoId]);
  refreshPickers();
  render();
}

function downloadCanvas(pngCanvas, name) {
  pngCanvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

function renderCoverAtSize(sizeKey) {
  const size = CA.EXPORT_SIZES[sizeKey];
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  CA.renderCover(off, state);
  return off;
}

function exportPng() {
  downloadCanvas(renderCoverAtSize(state.exportSize), `neon-coast-${state.exportSize}.png`);
}

function exportAllSizes() {
  Object.keys(CA.EXPORT_SIZES).forEach((key, i) => {
    setTimeout(() => downloadCanvas(renderCoverAtSize(key), `neon-coast-${key}.png`), i * 350);
  });
}

document.getElementById('shuffleBtn').addEventListener('click', shufflePhotos);
document.getElementById('spreadBtn').addEventListener('click', spreadPhoto);
document.getElementById('exportBtn').addEventListener('click', exportPng);
document.getElementById('exportAllBtn').addEventListener('click', exportAllSizes);
document.getElementById('undoBtn').addEventListener('click', () => {
  if (!undoStack.length) return;
  redoStack.push(snapshotState());
  restoreSnapshot(undoStack.pop());
  syncHistoryButtons();
});
document.getElementById('redoBtn').addEventListener('click', () => {
  if (!redoStack.length) return;
  undoStack.push(snapshotState());
  restoreSnapshot(redoStack.pop());
  syncHistoryButtons();
});

titleInput.addEventListener('input', () => { state.title = titleInput.value.toUpperCase(); render(); });
subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; render(); });
sizeSelect.addEventListener('change', () => {
  pushHistory();
  state.exportSize = sizeSelect.value;
  render();
});

uploadInput.addEventListener('change', () => {
  const file = uploadInput.files && uploadInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    uploadCount += 1;
    const id = 'upload-' + uploadCount;
    photoImages.set(id, img);
    photoLabels.set(id, file.name || 'Your photo');
    addLibraryThumb(id);
    assignPhotoToSelected(id);
  };
  img.src = url;
  uploadInput.value = '';
});

/* ---------------- shot scenes (deterministic screenshots) -------- */
function applyShotScene(name) {
  const scene = window.SHOT_SCENES && window.SHOT_SCENES[name];
  if (!scene) return false;
  state.title = scene.title;
  state.subtitle = scene.subtitle;
  state.layout = scene.layout;
  state.grade = scene.grade;
  if (scene.exportSize) state.exportSize = scene.exportSize;
  setLayoutPhotos(scene.layout, scene.photos);
  if (scene.chrome === 'cover') {
    document.body.classList.add('shot-cover');
    // the capture viewport equals the scene size, so draw 1:1 into it
    canvas.width = scene.viewport[0];
    canvas.height = scene.viewport[1];
    CA.renderCover(canvas, state);
  } else {
    syncControlsFromState();
    render();
  }
  document.body.dataset.shotReady = '1';
  return true;
}

/* ---------------- init ---------------- */
function loadLibrary() {
  return Promise.all(CA.PHOTO_LIBRARY.map((photo) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      photoImages.set(photo.id, img);
      photoLabels.set(photo.id, photo.label);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = photo.src;
  })));
}

async function init() {
  await loadLibrary();
  CA.PHOTO_LIBRARY.forEach((photo) => { if (photoImages.has(photo.id)) addLibraryThumb(photo.id); });
  Object.entries(CA.EXPORT_SIZES).forEach(([id, s]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = s.label;
    sizeSelect.appendChild(opt);
  });
  setLayoutPhotos('heroSpread', DEFAULT_PHOTOS.heroSpread);
  syncControlsFromState();
  render();
  const shotName = new URLSearchParams(location.search).get('shot');
  if (shotName) applyShotScene(shotName);
}

init();
