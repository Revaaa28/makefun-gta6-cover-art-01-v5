'use strict';
/*
 * NEON COAST — deterministic screenshot scenes.
 *
 * Open app/index.html?shot=<name> and the editor applies the scene,
 * renders it, then sets document.body[data-shot-ready="1"] so a headless
 * browser knows the frame is final. Mirrored in shots.json at the root.
 */
window.SHOT_SCENES = {
  cover: {
    chrome: 'cover',
    file: 'screenshots/1-cover.jpg',
    viewport: [1280, 720],
    layout: 'heroSpread',
    grade: 'posterInk',
    title: 'NEON COAST',
    subtitle: 'Sunset Heist',
    photos: ['hero'],
  },
  editor: {
    chrome: 'editor',
    file: 'screenshots/2-editor.jpg',
    viewport: [1280, 720],
    layout: 'heroSpread',
    grade: 'posterInk',
    title: 'NEON COAST',
    subtitle: 'Sunset Heist',
    photos: ['hero'],
    exportSize: 'wide',
  },
  portrait: {
    chrome: 'cover',
    file: 'screenshots/3-portrait.jpg',
    viewport: [1024, 1280],
    layout: 'tiltedShots',
    grade: 'neonNights',
    title: 'NEON COAST',
    subtitle: 'Boulevard Queen',
    photos: ['rooftop', 'carfriends', 'marina'],
  },
  square: {
    chrome: 'cover',
    file: 'screenshots/4-square.jpg',
    viewport: [1080, 1080],
    layout: 'quadDistinct',
    grade: 'goldenHour',
    title: 'NEON COAST',
    subtitle: 'Pier Pressure',
    photos: ['beachdrive', 'pool', 'pier', 'boulevard'],
  },
};
