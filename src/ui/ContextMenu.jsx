import { useEffect, useRef } from 'react';
import { reorderObject, updateAnnotation, updateObject } from '../core/document.js';
import { useEditor, getEditor } from '../state/editorStore.js';
import { addKeyframeForSelection } from '../state/actions.js';
import { placeFromTool } from '../board/interaction.js';

export function ContextMenu() {
  const menu = useEditor((s) => s.menu);
  const ref = useRef(null);
  useEffect(() => {
    if (menu) ref.current?.querySelector('button')?.focus();
  }, [menu]);
  if (!menu) return null;
  const ed = getEditor();
  const close = () => ed.openMenu(null);
  const { selection, doc } = ed;
  const hasObjects = selection.objects.length > 0;
  const single = selection.objects.length === 1 ? doc.objects[selection.objects[0]] : null;
  const ann = selection.annotations.length === 1 ? doc.annotations[selection.annotations[0]] : null;
  const anySel = hasObjects || selection.annotations.length || selection.events.length;
  const items = [];
  if (hasObjects || ann) {
    items.push(['Duplicate', () => ed.duplicateSelection()]);
    items.push(['Copy', () => ed.copySelection()]);
  }
  if (single?.type === 'player') {
    items.push(['Give this player the ball', () => ed.commit((d) => { d.ball.owner = single.id; d.ball.dead = false; })]);
    items.push(['Add keyframe', () => addKeyframeForSelection()]);
  }
  if (hasObjects) {
    const locked = single?.locked;
    items.push([locked ? 'Unlock' : 'Lock', () => ed.commit((d) => selection.objects.forEach((id) => updateObject(d, id, { locked: !locked })))]);
    items.push(['Bring to front', () => ed.commit((d) => selection.objects.forEach((id) => reorderObject(d, id, 'front')))]);
    items.push(['Send to back', () => ed.commit((d) => selection.objects.forEach((id) => reorderObject(d, id, 'back')))]);
  }
  if (ann) items.push([ann.locked ? 'Unlock' : 'Lock', () => ed.commit((d) => updateAnnotation(d, ann.id, { locked: !ann.locked }))]);
  if (anySel) items.push(['Delete', () => ed.deleteSelection(), true]);
  if (!anySel) {
    if (ed.clipboard) items.push(['Paste', () => ed.paste()]);
    items.push(['Add home player here', () => placeFromTool('player-home', menu.world)]);
    items.push(['Add away player here', () => placeFromTool('player-away', menu.world)]);
    items.push(['Add cone here', () => placeFromTool('cone', menu.world)]);
    items.push(['Place the ball here', () => ed.commit((d) => { d.ball = { x: menu.world.x, y: menu.world.y, owner: null, dead: false }; })]);
  }
  const left = Math.min(menu.x, window.innerWidth - 220);
  const top = Math.min(menu.y, window.innerHeight - items.length * 32 - 16);
  const onKey = (e) => {
    const buttons = [...ref.current.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };
  return (
    <div className="ctxmenu" ref={ref} role="menu" style={{ left, top }} onKeyDown={onKey}>
      {items.map(([label, run, danger]) => (
        <button key={label} type="button" role="menuitem" className={danger ? 'is-danger' : ''} onClick={() => { run(); close(); }}>{label}</button>
      ))}
    </div>
  );
}
