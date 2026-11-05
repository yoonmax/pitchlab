import { useEffect, useRef, useState } from 'react';
import { Crosshair, FlipHorizontal2, Layers, LocateFixed, Minus, Plus, RectangleHorizontal, RectangleVertical, Scan, Spline as PathIcon } from 'lucide-react';
import { useEditor } from '../state/editorStore.js';
import { camera } from '../board/camera.js';
import { IconButton } from './common.jsx';

function ZoomReadout() {
  const ref = useRef(null);
  useEffect(() => {
    const write = () => {
      if (ref.current) ref.current.textContent = `${Math.round((camera.cam.zoom / camera.fitZoom) * 100)}%`;
    };
    write();
    return camera.subscribe(write);
  }, []);
  return <button type="button" ref={ref} className="zoomread" title="Fit the pitch (0)" onClick={() => camera.fit()} aria-label="Zoom level. Click to fit the pitch." />;
}

export function ViewControls() {
  const followMode = useEditor((s) => s.followMode);
  const pathMode = useEditor((s) => s.pathMode);
  const showAnnotations = useEditor((s) => s.showAnnotations);
  const [, force] = useState(0);
  const rot = camera.target.rot;
  const vertical = Math.abs(rot % 180) === 90;
  const setFollow = (m) => useEditor.setState({ followMode: followMode === m ? 'none' : m });
  const nextPath = { all: 'active', active: 'none', none: 'all' }[pathMode];
  const pathLabel = { all: 'Showing all lines', active: 'Showing only current lines', none: 'Lines hidden' }[pathMode];
  return (
    <div className="viewctl" role="toolbar" aria-label="View">
      <IconButton icon={Minus} label="Zoom out" shortcut={'−'} onClick={() => camera.zoomStep(1 / 1.3)} />
      <ZoomReadout />
      <IconButton icon={Plus} label="Zoom in" shortcut="+" onClick={() => camera.zoomStep(1.3)} />
      <i className="bar-sep" />
      <IconButton icon={Scan} label="Fit the pitch" shortcut="0" onClick={() => { useEditor.setState({ followMode: 'none' }); camera.fit(); }} data-testid="fit" />
      <IconButton
        icon={vertical ? RectangleHorizontal : RectangleVertical} label={vertical ? 'Horizontal pitch' : 'Vertical pitch'} data-testid="orient"
        onClick={() => { camera.rotateTo(vertical ? 0 : -90); force((n) => n + 1); }}
      />
      <IconButton icon={FlipHorizontal2} label="Rotate the pitch 180 degrees" data-testid="flip" onClick={() => { camera.rotateTo(camera.target.rot + 180); force((n) => n + 1); }} />
      <i className="bar-sep" />
      <IconButton icon={Crosshair} label="Follow the ball" active={followMode === 'ball'} onClick={() => setFollow('ball')} data-testid="follow-ball" />
      <IconButton icon={LocateFixed} label="Follow the selected player" active={followMode === 'selected'} onClick={() => setFollow('selected')} />
      <i className="bar-sep" />
      <IconButton icon={PathIcon} label={`${pathLabel}. Click to change.`} active={pathMode !== 'all'} onClick={() => useEditor.setState({ pathMode: nextPath })} />
      <IconButton icon={Layers} label={showAnnotations ? 'Hide annotations' : 'Show annotations'} active={!showAnnotations} onClick={() => useEditor.setState({ showAnnotations: !showAnnotations })} />
    </div>
  );
}
