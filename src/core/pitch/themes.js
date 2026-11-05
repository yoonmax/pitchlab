/**
 * Pitch appearances. Every colour a board needs lives here so exports and
 * thumbnails match the live board without reading CSS.
 */
export const PITCH_THEMES = {
  forest: {
    ballLine: '#eab93c', label: 'Forest green', ground: '#1f4433', stripe: '#234b39', line: '#e9e8db', lineOpacity: 0.86,
    surround: '#193829', overlay: '#f4f3ec', text: '#f4f3ec', arrow: '#f4f3ec',
  },
  classic: {
    ballLine: '#f2c745', label: 'Classic green', ground: '#2c6a44', stripe: '#31734b', line: '#f7f7ef', lineOpacity: 0.92,
    surround: '#265d3b', overlay: '#ffffff', text: '#ffffff', arrow: '#ffffff',
  },
  technical: {
    ballLine: '#a97708', label: 'White technical', ground: '#fbfaf5', stripe: '#f4f3ec', line: '#23261f', lineOpacity: 0.72,
    surround: '#f0efe7', overlay: '#23261f', text: '#23261f', arrow: '#23261f',
  },
  analysis: {
    ballLine: '#e0ab22', label: 'Dark analysis', ground: '#191e1a', stripe: '#1c221d', line: '#8e988c', lineOpacity: 0.72,
    surround: '#141815', overlay: '#c9d1c6', text: '#e9e8de', arrow: '#e9e8de',
  },
  blueprint: {
    ballLine: '#f0c75a', label: 'Blueprint', ground: '#17395f', stripe: '#1a3f68', line: '#c7dcf2', lineOpacity: 0.82,
    surround: '#143253', overlay: '#c7dcf2', text: '#eaf3fb', arrow: '#eaf3fb',
  },
  mono: {
    ballLine: '#8a6000', label: 'Neutral monochrome', ground: '#d9d8d1', stripe: '#d2d1ca', line: '#3a3c37', lineOpacity: 0.7,
    surround: '#cfcec7', overlay: '#3a3c37', text: '#23261f', arrow: '#23261f',
  },
};

export function getTheme(id) {
  return PITCH_THEMES[id] ?? PITCH_THEMES.forest;
}

export const BALL_COLOR = '#e0ab22';

export const SWATCHES = [
  '#b4372b', '#2e5a88', '#e0ab22', '#2f7d55', '#6a4a8c', '#23261f', '#f4f3ec', '#c86a2a', '#3d8c96', '#8a8d82',
];

export const KIT_DEFAULTS = {
  home: { color: '#b4372b', gk: '#e0ab22', text: '#ffffff' },
  away: { color: '#2e5a88', gk: '#3d8c96', text: '#ffffff' },
  neutral: { color: '#8a8d82', gk: '#8a8d82', text: '#ffffff' },
};

/** Relative luminance, so numbers on a marker stay readable on any chosen colour. */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function readableOn(hex) {
  return luminance(hex) > 0.36 ? '#1b1e18' : '#ffffff';
}
