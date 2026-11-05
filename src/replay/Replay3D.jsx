import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { X, Play, Pause } from 'lucide-react';
import { ballAt, compile, positionAt } from '../core/animation/timeline.js';
import { pitchPrimitives } from '../core/pitch/geometry.js';
import { getTheme, BALL_COLOR } from '../core/pitch/themes.js';
import { useEditor } from '../state/editorStore.js';
import { transport } from '../state/transport.js';
import { IconButton, Segmented } from '../ui/common.jsx';
import { objectColor } from '../board/marks.jsx';

const SCALE_TEX = 14;

/** Draw the markings from the same primitives as the 2D board. */
function usePitchTexture(pitch, theme) {
  return useMemo(() => {
    const pad = 6;
    const w = (pitch.length + pad * 2) * SCALE_TEX;
    const h = (pitch.width + pad * 2) * SCALE_TEX;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d');
    c.fillStyle = theme.surround;
    c.fillRect(0, 0, w, h);
    c.translate(pad * SCALE_TEX, pad * SCALE_TEX);
    c.scale(SCALE_TEX, SCALE_TEX);
    c.fillStyle = theme.ground;
    c.fillRect(0, 0, pitch.length, pitch.width);
    if (pitch.stripes) {
      c.fillStyle = theme.stripe;
      const n = Math.max(6, Math.round(pitch.length / 8.75));
      const sw = pitch.length / n;
      for (let i = 0; i < n; i += 2) c.fillRect(i * sw, 0, sw, pitch.width);
    }
    c.strokeStyle = theme.line;
    c.fillStyle = theme.line;
    c.lineWidth = 0.14;
    for (const p of pitchPrimitives(pitch)) {
      c.beginPath();
      if (p.kind === 'rect' && !p.goal) c.rect(p.x, p.y, p.w, p.h);
      else if (p.kind === 'line') { c.moveTo(p.x1, p.y1); c.lineTo(p.x2, p.y2); }
      else if (p.kind === 'circle') c.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
      else if (p.kind === 'spot') { c.arc(p.cx, p.cy, 0.22, 0, Math.PI * 2); c.fill(); continue; }
      else if (p.kind === 'arc') {
        const path = new Path2D(`M${p.x1} ${p.y1}A${p.r} ${p.r} 0 0 ${p.sweep} ${p.x2} ${p.y2}`);
        c.stroke(path);
        continue;
      }
      c.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { tex, pad };
  }, [pitch, theme]);
}

function Goal({ pitch, side }) {
  const x = side ? pitch.length : 0;
  const z = pitch.width / 2;
  const hw = pitch.goalWidth / 2;
  const height = pitch.goalWidth < 5 ? (pitch.goalWidth < 4 ? 1.83 : 2.13) : 2.44;
  const depth = (side ? 1 : -1) * pitch.goalDepth;
  const mat = <meshStandardMaterial color="#f4f3ec" roughness={0.5} />;
  const r = 0.07;
  return (
    <group>
      <mesh position={[x, height / 2, z - hw]} castShadow><cylinderGeometry args={[r, r, height, 8]} />{mat}</mesh>
      <mesh position={[x, height / 2, z + hw]} castShadow><cylinderGeometry args={[r, r, height, 8]} />{mat}</mesh>
      <mesh position={[x, height, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[r, r, pitch.goalWidth, 8]} />{mat}</mesh>
      <mesh position={[x + depth / 2, height / 2, z]}>
        <boxGeometry args={[Math.abs(depth), height, pitch.goalWidth]} />
        <meshStandardMaterial color="#f4f3ec" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

/** Reads positions from sample functions each frame, so 3D cannot drift from the 2D timeline. */
function Scene({ doc, compiled, cameraMode }) {
  const theme = getTheme(doc.pitch.theme);
  const { tex, pad } = usePitchTexture(doc.pitch, theme);
  const players = useMemo(() => Object.values(doc.objects).filter((o) => o.type === 'player' && !o.hidden), [doc.objects]);
  const props = useMemo(() => Object.values(doc.objects).filter((o) => o.type !== 'player' && !o.hidden), [doc.objects]);
  const groups = useRef({});
  const ballRef = useRef(null);
  const shadowRef = useRef(null);
  const { camera } = useThree();
  const L = doc.pitch.length;
  const W = doc.pitch.width;
  const lookAt = useRef(new THREE.Vector3(L / 2, 0, W / 2));
  const free = useRef({ theta: -0.9, phi: 0.75, dist: Math.max(L, W) * 1.05 });
  const dragging = useRef(null);
  const { gl } = useThree();

  useEffect(() => {
    if (cameraMode !== 'free') return undefined;
    const el = gl.domElement;
    const down = (e) => { dragging.current = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); };
    const move = (e) => {
      if (!dragging.current) return;
      free.current.theta -= (e.clientX - dragging.current.x) * 0.006;
      free.current.phi = Math.min(1.45, Math.max(0.2, free.current.phi - (e.clientY - dragging.current.y) * 0.005));
      dragging.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => { dragging.current = null; };
    const wheel = (e) => { e.preventDefault(); free.current.dist = Math.min(240, Math.max(12, free.current.dist * Math.exp(e.deltaY * 0.001))); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [cameraMode, gl]);

  useFrame((_, dt) => {
    const t = transport.t;
    for (const o of players) {
      const g = groups.current[o.id];
      if (!g) continue;
      const p = positionAt(compiled, o.id, t);
      g.position.set(p.x, 0, p.y);
    }
    const b = ballAt(compiled, t);
    if (ballRef.current) ballRef.current.position.set(b.x, 0.38 + b.h, b.y);
    if (shadowRef.current) shadowRef.current.position.set(b.x, 0.02, b.y);

    const target = new THREE.Vector3();
    const look = new THREE.Vector3();
    const ballV = new THREE.Vector3(b.x, 0, b.y);
    switch (cameraMode) {
      case 'broadcast':
        target.set(L / 2 + (b.x - L / 2) * 0.55, Math.max(L, W) * 0.34, W + Math.max(L, W) * 0.42);
        look.set(L / 2 + (b.x - L / 2) * 0.82, 0, W / 2 + (b.y - W / 2) * 0.25);
        break;
      case 'tactical':
        target.set(L / 2, Math.max(L, W) * 0.95, W / 2 + 0.01);
        look.set(L / 2, 0, W / 2);
        break;
      case 'sideline':
        target.set(b.x, 3.2, W + 7);
        look.copy(ballV);
        break;
      case 'elevated':
        target.set(-L * 0.18, Math.max(L, W) * 0.5, W / 2);
        look.set(L * 0.55, 0, W / 2);
        break;
      case 'follow':
        target.set(b.x - 14, 11, b.y + 14);
        look.copy(ballV);
        break;
      default: {
        const { theta, phi, dist } = free.current;
        target.set(L / 2 + dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi), W / 2 + dist * Math.sin(phi) * Math.cos(theta));
        look.set(L / 2, 0, W / 2);
      }
    }
    const k = 1 - Math.exp(-3.5 * dt);
    camera.position.lerp(target, cameraMode === 'free' ? 1 : k);
    lookAt.current.lerp(look, cameraMode === 'free' ? 1 : k);
    camera.lookAt(lookAt.current);
  });

  return (
    <>
      <hemisphereLight args={['#f6f4e8', '#2a3a2c', 0.85]} />
      <directionalLight position={[L * 0.3, 70, -30]} intensity={1.9} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-90} shadow-camera-right={90} shadow-camera-top={90} shadow-camera-bottom={-90} shadow-camera-far={220} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L / 2, 0, W / 2]} receiveShadow>
        <planeGeometry args={[L + pad * 2, W + pad * 2]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
      <Goal pitch={doc.pitch} side={0} />
      <Goal pitch={doc.pitch} side={1} />
      {players.map((o) => {
        const color = objectColor(o, doc.teams);
        return (
          <group key={o.id} ref={(el) => { groups.current[o.id] = el; }}>
            <mesh position={[0, 0.95, 0]} castShadow>
              <capsuleGeometry args={[0.32, 1.05, 6, 14]} />
              <meshStandardMaterial color={color} roughness={0.55} />
            </mesh>
            <mesh position={[0, 1.86, 0]} castShadow>
              <sphereGeometry args={[0.2, 16, 12]} />
              <meshStandardMaterial color="#e6dcc9" roughness={0.6} />
            </mesh>
          </group>
        );
      })}
      {props.map((o) => {
        const p = positionAt(compiled, o.id, 0);
        return (
          <mesh key={o.id} position={[p.x, 0.2, p.y]} castShadow>
            {o.type === 'cone' ? <coneGeometry args={[0.25, 0.4, 12]} /> : o.type === 'pole' ? <cylinderGeometry args={[0.04, 0.04, 1.6, 8]} /> : <boxGeometry args={[0.6, 0.6, 0.6]} />}
            <meshStandardMaterial color={o.color ?? '#e39a2d'} />
          </mesh>
        );
      })}
      <mesh ref={ballRef} castShadow>
        <sphereGeometry args={[0.38, 20, 16]} />
        <meshStandardMaterial color={BALL_COLOR} roughness={0.4} />
      </mesh>
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.45, 16]} />
        <meshBasicMaterial color="#000" transparent opacity={0.25} />
      </mesh>
    </>
  );
}

const CAMERAS = [
  { value: 'broadcast', label: 'Broadcast' }, { value: 'tactical', label: 'Tactical' }, { value: 'sideline', label: 'Sideline' },
  { value: 'elevated', label: 'Elevated' }, { value: 'follow', label: 'Follow ball' }, { value: 'free', label: 'Free' },
];

export default function Replay3D({ onClose }) {
  const doc = useEditor((s) => s.doc);
  const compiled = compile(doc);
  const [cameraMode, setCameraMode] = useState('broadcast');
  const [playing, setPlaying] = useState(transport.playing);
  const scrub = useRef(null);
  useEffect(() => {
    const offS = transport.onState(() => setPlaying(transport.playing));
    const offF = transport.onFrame((t) => { if (scrub.current) scrub.current.value = t; });
    if (compiled.duration > 0 && !transport.playing) { transport.setLoop(true); transport.restart(); }
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { offS(); offF(); transport.setLoop(false); transport.pause(); window.removeEventListener('keydown', onKey); };
  }, []);
  return (
    <div className="replay" role="dialog" aria-modal="true" aria-label="3D replay" data-testid="replay">
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 38, near: 0.5, far: 600, position: [doc.pitch.length / 2, 40, doc.pitch.width + 40] }}>
        <color attach="background" args={[getTheme(doc.pitch.theme).surround]} />
        <Scene doc={doc} compiled={compiled} cameraMode={cameraMode} />
      </Canvas>
      <div className="replay-bar">
        <button type="button" className="playbtn" aria-label={playing ? 'Pause' : 'Play'} onClick={() => transport.toggle()}>
          {playing ? <Pause size={15} fill="currentColor" strokeWidth={0} /> : <Play size={15} fill="currentColor" strokeWidth={0} />}
        </button>
        <input ref={scrub} type="range" min={0} max={Math.max(compiled.duration, 1)} step={0.01} defaultValue={transport.t} aria-label="Scrub the replay" onChange={(e) => { transport.pause(); transport.seek(Number(e.target.value)); }} />
        <Segmented small label="Camera" value={cameraMode} onChange={setCameraMode} options={CAMERAS} />
        <IconButton icon={X} label="Close the 3D replay" onClick={onClose} />
      </div>
      <p className="replay-note">Plays the same timeline as the board. Figures are simple shapes and show position only.</p>
    </div>
  );
}
