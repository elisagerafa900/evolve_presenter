// Slide designer: place the words box and add pictures, text and shapes that show on every slide of a song.
// Everything is stored in % of the screen, so it looks the same on any output size.
import { useRef, useState } from 'react';
import { Canvas, DEFAULT_BOX, BOX_PRESETS, FONTS, ObjectsLayer } from './Render.jsx';
import { uid } from './defaults.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v) => Math.round(v * 10) / 10;

export default function Designer({ design, onChange, media, sampleText, theme, background }) {
  const d = design || {};
  const box = d.box || theme.box || DEFAULT_BOX;
  const objects = d.objects || [];
  const [sel, setSel] = useState(null); // 'box' | object id
  const stage = useRef(null);
  const set = (patch) => onChange({ ...d, ...patch });
  const setObj = (id, patch) => set({ objects: objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const images = media.filter((m) => m.kind === 'image');
  const withUrls = objects.map((o) => (o.type === 'image' ? { ...o, url: images.find((m) => m.id === o.mediaId)?.url } : o));

  const add = (type) => {
    const o = type === 'text'
      ? { id: uid(), type, x: 30, y: 4, w: 40, h: 10, text: 'Text', size: 54, color: '#ffffff', bold: true, font: 'sans' }
      : type === 'image'
        ? { id: uid(), type, x: 80, y: 4, w: 16, h: 16, mediaId: images[0]?.id || '', fit: 'contain' }
        : { id: uid(), type, x: 0, y: 70, w: 100, h: 30, color: '#1e1b4b', opacity: 0.7, shape: 'rect', radius: 0 };
    set({ objects: [...objects, o] });
    setSel(o.id);
  };

  // drag to move, drag the corner to resize
  const startDrag = (e, id, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setSel(id);
    const r = stage.current.getBoundingClientRect();
    const start = id === 'box' ? box : objects.find((o) => o.id === id);
    const sx = e.clientX, sy = e.clientY;
    const move = (ev) => {
      const dx = ((ev.clientX - sx) / r.width) * 100;
      const dy = ((ev.clientY - sy) / r.height) * 100;
      const next = mode === 'move'
        ? { x: round(clamp(start.x + dx, -start.w + 2, 98)), y: round(clamp(start.y + dy, -start.h + 2, 98)) }
        : { w: round(clamp(start.w + dx, 3, 100 - start.x + 50)), h: round(clamp(start.h + dy, 3, 100 - start.y + 50)) };
      if (id === 'box') set({ box: { ...box, ...next } });
      else setObj(id, next);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const cur = objects.find((o) => o.id === sel);
  const frame = (item, id, label) => (
    <div key={id} className={`dz-frame ${sel === id ? 'sel' : ''} ${id === 'box' ? 'box' : ''}`}
      style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` }}
      onPointerDown={(e) => startDrag(e, id, 'move')}>
      {label && <span className="dz-label">{label}</span>}
      <span className="dz-handle" onPointerDown={(e) => startDrag(e, id, 'size')} />
    </div>
  );

  return (
    <div className="designer">
      <div className="dz-tools">
        <button className="btn small" onClick={() => add('text')}>＋ Text</button>
        <button className="btn small" onClick={() => add('image')} disabled={!images.length} title={images.length ? '' : 'Add a picture to the media bin first'}>＋ Picture</button>
        <button className="btn small" onClick={() => add('shape')}>＋ Shape</button>
        <div className="spacer" />
        <span className="muted small">Words box:</span>
        {Object.entries({ full: 'Full', lower: 'Lower', top: 'Top', left: 'Left' }).map(([k, l]) => (
          <button key={k} className="btn small ghost" onClick={() => { set({ box: BOX_PRESETS[k] }); setSel('box'); }}>{l}</button>
        ))}
      </div>
      <div className="dz-stage" ref={stage} onPointerDown={() => setSel(null)}>
        <Canvas>
          <div className="lyr" style={{ background: background || '#000' }} />
          <ObjectsLayer objects={withUrls} />
          <div className="dz-text" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, fontFamily: FONTS[theme.font] || FONTS.sans, color: theme.color, textAlign: theme.align, textTransform: theme.uppercase ? 'uppercase' : 'none', fontSize: Math.round((theme.maxSize || 110) * 0.7), alignItems: theme.align === 'left' ? 'flex-start' : 'center' }}>
            <span>{sampleText || 'Words appear here'}</span>
          </div>
        </Canvas>
        {frame(box, 'box', 'Words')}
        {objects.map((o) => frame(o, o.id))}
      </div>

      <div className="dz-props">
        {!sel && <span className="muted small">Drag the dotted words box to move it, the corner to resize. Click an object to edit it.</span>}
        {sel === 'box' && (
          <>
            <span className="muted small">Words box · {box.w}% × {box.h}%</span>
            <div className="spacer" />
            <button className="btn small ghost" onClick={() => { set({ box: undefined }); setSel(null); }}>Use the show's position</button>
          </>
        )}
        {cur && (
          <>
            {cur.type === 'text' && (
              <>
                <input className="input small grow" value={cur.text} onChange={(e) => setObj(cur.id, { text: e.target.value })} />
                <input className="input small num" type="number" min="12" max="300" value={cur.size} onChange={(e) => setObj(cur.id, { size: +e.target.value || 48 })} title="Size" />
                <select className="input small" value={cur.font || 'sans'} onChange={(e) => setObj(cur.id, { font: e.target.value })}>
                  <option value="sans">Clean</option><option value="serif">Classic</option><option value="condensed">Condensed</option>
                </select>
                <label className="check small"><input type="checkbox" checked={!!cur.bold} onChange={(e) => setObj(cur.id, { bold: e.target.checked })} />Bold</label>
              </>
            )}
            {cur.type === 'image' && (
              <>
                <select className="input small grow" value={cur.mediaId} onChange={(e) => setObj(cur.id, { mediaId: e.target.value })}>
                  {images.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select className="input small" value={cur.fit || 'contain'} onChange={(e) => setObj(cur.id, { fit: e.target.value })}>
                  <option value="contain">Fit</option><option value="cover">Fill</option>
                </select>
              </>
            )}
            {cur.type === 'shape' && (
              <select className="input small" value={cur.shape || 'rect'} onChange={(e) => setObj(cur.id, { shape: e.target.value })}>
                <option value="rect">Rectangle</option><option value="circle">Circle</option>
              </select>
            )}
            {cur.type !== 'image' && <input type="color" className="color small sw" value={cur.color || '#ffffff'} onChange={(e) => setObj(cur.id, { color: e.target.value })} title="Colour" />}
            <input type="range" min="0.1" max="1" step="0.05" value={cur.opacity ?? 1} onChange={(e) => setObj(cur.id, { opacity: +e.target.value })} title="See-through" className="op" />
            <button className="icon-btn" title="Bring to front" onClick={() => set({ objects: [...objects.filter((o) => o.id !== cur.id), cur] })}>⇡</button>
            <button className="icon-btn" title="Delete" onClick={() => { set({ objects: objects.filter((o) => o.id !== cur.id) }); setSel(null); }}>🗑</button>
          </>
        )}
      </div>
    </div>
  );
}
