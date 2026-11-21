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
    layout: 'posterGrid',
    grade: 'posterInk',
    title: 'NEON COAST',
    subtitle: 'Sunset Heist',
    photos: ['rooftop', 'hero', 'carfriends', 'pool', 'beachdrive'],
  },
  editor: {
    chrome: 'editor',
    file: 'screenshots/2-editor.jpg',
    viewport: [1280, 720],
    layout: 'posterGrid',
    grade: 'posterInk',
    title: 'NEON COAST',
    subtitle: 'Sunset Heist',
    photos: ['rooftop', 'hero', 'carfriends', 'pool', 'beachdrive'],
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
    layout: 'posterGrid',
    grade: 'goldenHour',
    title: 'NEON COAST',
    subtitle: 'Pier Pressure',
    // Marina (a faceless night scene) takes the grid cell the centred
    // subtitle and heat stars land on; faces stay clear of the text.
    photos: ['pier', 'marina', 'boulevard', 'pool', 'carfriends'],
  },
};
