import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Eraser, Footprints, Hand, Highlighter, MoveUpRight, MousePointer2, PenLine, Plus, Send, Shapes, ShieldHalf, Target, Type, Waves, Spline, Zap } from 'lucide-react';
import { useEditor } from '../state/editorStore.js';
import { prefersReducedMotion } from '../board/camera.js';

export const TOOLS = [
  { id: 'select', label: 'Select', icon: MousePointer2, hint: 'Click to select. Drag to move. Drag empty pitch to select several.' },
  { id: 'move', label: 'Move and pan', icon: Hand, hint: 'Drag players to move them. Drag anywhere else to pan.' },
  { sep: true },
  { id: 'pass', label: 'Pass', icon: Send, hint: 'Drag from a player to a team-mate or a space on the pitch.' },
  { id: 'run', label: 'Run', icon: Footprints, hint: 'Drag from a player along the run. Curves are smoothed for you.' },
  { id: 'dribble', label: 'Dribble', icon: Waves, hint: 'Drag from the player with the ball.' },
  { id: 'shot', label: 'Shot', icon: Target, hint: 'Drag from a player to where the shot goes. Click a player to aim at the centre of the goal.' },
  { id: 'defend', label: 'Defensive movement', icon: ShieldHalf, hint: 'Drag from a defender to where they recover.' },
  { id: 'press', label: 'Press', icon: Zap, hint: 'Drag from a player towards the ball carrier.' },
  { sep: true },
  { id: 'arrow', label: 'Draw arrow', icon: MoveUpRight, hint: 'Drag to draw. Arrows snap to players and follow them.' },
  { id: 'pen', label: 'Freehand', icon: PenLine, hint: 'Drag to draw a smooth freehand line.' },
  { id: 'highlight', label: 'Highlight', icon: Highlighter, hint: 'Drag to highlight an area with a broad marker.' },
  { id: 'zone', label: 'Zone', icon: Spline, hint: 'Drag around an area to mark a zone.' },
  { id: 'shape', label: 'Shape', icon: Shapes, hint: 'Drag to draw a shape.' },
  { id: 'text', label: 'Text', icon: Type, hint: 'Click where the note should go.' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, hint: 'Click or drag over lines and notes to remove them. Players are kept.' },
  { sep: true },
  { id: 'place', label: 'Add players and equipment', icon: Plus, hint: 'Click the pitch to place one. Press Esc when done.' },
];

export const TOOL_VARIANTS = {
  pass: { group: 'pass', options: [['pass', 'Pass'], ['through', 'Through ball'], ['cross', 'Cross'], ['switch', 'Switch of play'], ['clearance', 'Clearance'], ['setpiece', 'Set-piece delivery']] },
  run: { group: 'run', options: [['run', 'Run'], ['overlap', 'Overlap'], ['underlap', 'Underlap']] },
  arrow: { group: 'arrow', options: [['straight', 'Straight'], ['curved', 'Curved'], ['dashed', 'Dashed'], ['free', 'Follows your stroke']] },
  shape: { group: 'shape', options: [['rect', 'Rectangle'], ['circle', 'Circle']] },
  place: { group: 'place', options: [['player-home', 'Home player'], ['player-away', 'Away player'], ['player-neutral', 'Neutral player'], ['cone', 'Cone'], ['pole', 'Pole'], ['mannequin', 'Mannequin'], ['smallgoal', 'Small goal'], ['fullgoal', 'Full goal'], ['coach', 'Coach'], ['ballprop', 'Spare ball']] },
};

export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const keys = useEditor((s) => s.toolKeys);
  const railRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const marker = markerRef.current;
    const btn = rail?.querySelector(`[data-tool="${tool}"]`);
    if (!btn || !marker) return;
    const vars = { x: btn.offsetLeft, y: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight };
    if (!ready || prefersReducedMotion()) { gsap.set(marker, vars); setReady(true); } else gsap.to(marker, { ...vars, duration: 0.16, ease: 'power2.out' });
  }, [tool, ready]);

  useEffect(() => {
    const place = () => {
      const btn = railRef.current?.querySelector(`[data-tool="${useEditor.getState().tool}"]`);
      if (btn) gsap.set(markerRef.current, { x: btn.offsetLeft, y: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight });
    };
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  return (
    <nav className="rail" ref={railRef} aria-label="Tools">
      <span className="rail-marker" ref={markerRef} aria-hidden="true" />
      {TOOLS.map((t, i) => (t.sep ? <i key={i} className="rail-sep" /> : (
        <button
          type="button" key={t.id} data-tool={t.id} data-testid={`tool-${t.id}`} className={`railbtn ${tool === t.id ? 'is-active' : ''}`}
          aria-label={t.label} aria-pressed={tool === t.id} title={keys?.[t.id] ? `${t.label} (${keys[t.id].toUpperCase()})` : t.label}
          onClick={() => setTool(t.id)}
        >
          <t.icon size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )))}
    </nav>
  );
}

export function ToolHint() {
  const tool = useEditor((s) => s.tool);
  const variants = useEditor((s) => s.variants);
  const setVariant = useEditor((s) => s.setVariant);
  const setTool = useEditor((s) => s.setTool);
  const meta = TOOLS.find((t) => t.id === tool);
  const v = TOOL_VARIANTS[tool];
  if (tool === 'select' || !meta) return null;
  return (
    <div className="toolhint" role="status">
      <strong>{meta.label}</strong>
      <span>{meta.hint}</span>
      {v && (
        <label className="toolhint-variant">
          <span className="sr-only">Kind</span>
          <select className="input input-sm" data-testid="tool-variant" value={variants[v.group]} onChange={(e) => setVariant(v.group, e.target.value)}>
            {v.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      )}
      <button type="button" className="linkbtn" onClick={() => setTool('select')}>Done</button>
    </div>
  );
}

