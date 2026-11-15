// Output window: ?view=audience (projector / screens) or ?view=stage (stage display).
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { AudienceView, Canvas, StageView } from './Render.jsx';
import './styles.css';

const params = new URLSearchParams(location.search);
const view = params.get('view') === 'stage' ? 'stage' : 'audience';
const alpha = params.get('alpha') === '1'; // NDI key: see-through background

function Output() {
  const [state, setState] = useState(null);
  useEffect(() => {
    const api = window.presenter;
    if (!api) return;
    api.getLive().then((s) => s && setState(s));
    return api.onLive(setState);
  }, []);
  return (
    <div className={`output-root ${alpha ? "alpha" : ""}`}>
      <Canvas>{view === 'stage' ? <StageView state={state} /> : <AudienceView state={state} alpha={alpha} />}</Canvas>
    </div>
  );
}

const bg = alpha ? 'transparent' : '#000';
document.documentElement.style.background = bg;
document.body.style.background = bg;
document.body.style.cursor = 'none';
createRoot(document.getElementById('root')).render(<Output />);
