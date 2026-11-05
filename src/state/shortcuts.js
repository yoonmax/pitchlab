/** Single-key tool shortcuts can be rebound in settings. Combinations are fixed so they match the platform. */
export const DEFAULT_TOOL_KEYS = {
  select: 'v', move: 'h', pass: 'p', run: 'r', dribble: 'd', shot: 's', defend: 'g', press: 'x',
  arrow: 'a', pen: 'f', highlight: 'l', zone: 'z', shape: 'u', text: 't', eraser: 'e',
};

export const FIXED_SHORTCUTS = [
  ['Space', 'Play or pause'],
  ['K', 'Add a keyframe for the selected player'],
  ['Delete', 'Delete the selection'],
  ['Esc', 'Deselect, or go back to the select tool'],
  ['⌘Z', 'Undo'],
  ['⇧⌘Z', 'Redo'],
  ['⌘S', 'Save'],
  ['⇧⌘S', 'Save a copy'],
  ['⌘D', 'Duplicate'],
  ['⌘C and ⌘V', 'Copy and paste'],
  ['⌘A', 'Select all players'],
  ['Arrow keys', 'Nudge by 0.5 m; add ⇧ for 5 m'],
  [', and .', 'Step one frame back or forward'],
  ['[ and ]', 'Previous or next event'],
  ['+ and −', 'Zoom in or out'],
  ['0', 'Fit the pitch'],
  ['⇧P', 'Presentation mode'],
  ['⇧F', 'Fullscreen'],
  ['?', 'Show this list'],
];

export function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
