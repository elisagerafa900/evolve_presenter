// Draws the outputs. Used by the audience screen, the stage display and the operator's previews.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fillTokens, formatDuration, groupColor } from '../shared/presentation.js';

const W = 1920;
const H = 1080;

export const FONTS = {
  sans: '"Segoe UI", "Helvetica Neue", Ubuntu, "Noto Sans", Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", "Noto Serif", serif',
  condensed: 'Bahnschrift, "Arial Narrow", "Roboto Condensed", "Ubuntu Condensed", "Segoe UI", sans-serif',
};
export const DEFAULT_THEME = { font: 'sans', color: '#ffffff', uppercase: false, align: 'center', outline: true, maxSize: 110, background: '#000000', transition: 'fade', transitionMs: 300 };
// Where the words sit, in % of the screen. Default = centred with margins.
export const DEFAULT_BOX = { x: 6.8, y: 8.3, w: 86.4, h: 83.4 };
export const BOX_PRESETS = {
  full: DEFAULT_BOX,
  lower: { x: 6, y: 66, w: 88, h: 28 },
  top: { x: 6, y: 5, w: 88, h: 30 },
  left: { x: 5, y: 10, w: 52, h: 80 },
};
export const TRANSITIONS = { cut: 'Cut', fade: 'Fade', slide: 'Slide up', zoom: 'Zoom', blur: 'Blur in' };

/** Scales a 1920×1080 canvas to fit its parent. */
export function Canvas({ children }) {
  const box = useRef(null);
  const [scale, setScale] = useState(0.1);
  useLayoutEffect(() => {
    const el = box.current;
    const fit = () => setScale(Math.min(el.clientWidth / W, el.clientHeight / H) || 0.1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="canvas-box">
      <div className="canvas" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>{children}</div>
    </div>
  );
}

/** Designed objects (pictures, text, shapes) placed on a song's slides. Positions in % of the screen. */
export function ObjectsLayer({ objects }) {
  if (!objects?.length) return null;
  return (
    <div className="lyr objects-layer">
      {objects.map((o) => {
        const st = { left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%`, opacity: o.opacity ?? 1 };
        if (o.type === 'image') return o.url ? <img key={o.id} className="obj" style={{ ...st, objectFit: o.fit || 'contain', borderRadius: o.radius || 0 }} src={o.url} alt="" /> : null;
        if (o.type === 'shape') return <div key={o.id} className="obj" style={{ ...st, background: o.color || '#000', borderRadius: o.shape === 'circle' ? '50%' : (o.radius || 0) }} />;
        return (
          <div key={o.id} className="obj obj-text" style={{ ...st, color: o.color || '#fff', fontSize: o.size || 48, fontWeight: o.bold ? 700 : 500, textAlign: o.align || 'center', fontFamily: FONTS[o.font] || FONTS.sans }}>{o.text}</div>
        );
      })}
    </div>
  );
}

/** Shrinks the text until it fits its box. */
function FitText({ text, max, min = 30, className, style }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let s = max;
    el.style.fontSize = `${s}px`;
    while (s > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
      s -= 2;
      el.style.fontSize = `${s}px`;
    }
  }, [text, max, min, style?.fontFamily, style?.textTransform]);
  return <div ref={ref} className={className} style={style}>{text}</div>;
}

/** Re-renders twice a second (clocks and countdowns). */
export function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export const timerMs = (timer, now) => (timer?.endAt ? Math.max(0, timer.endAt - now) : (timer?.minutes || 0) * 60000);

function MediaLayer({ media }) {
  if (!media) return null;
  if (media.kind === 'color') return <div className="lyr" style={{ background: media.css }} />;
  if (media.kind === 'image') return <div className="lyr fade" key={media.url} style={{ backgroundImage: `url("${media.url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />;
  if (media.kind === 'video') return <video className="lyr media-video fade" key={media.url} src={media.url} autoPlay loop muted playsInline />;
  return null;
}

const CORNER = { tl: { top: 60, left: 70 }, tr: { top: 60, right: 70 }, bl: { bottom: 60, left: 70 }, br: { bottom: 60, right: 70 } };

/** Props: logos and lower thirds that sit over everything except messages. */
function PropsLayer({ props }) {
  if (!props?.length) return null;
  return (
    <div className="lyr props-layer">
      {props.map((p) => {
        if (p.kind === 'logo') {
          const pos = CORNER[p.position] || CORNER.tr;
          return (
            <div key={p.id} className="prop-logo fade" style={{ ...pos, height: p.size || 140 }}>
              {p.url ? <img src={p.url} alt="" /> : <span className="prop-logo-text">{p.title || 'Logo'}</span>}
            </div>
          );
        }
        // lower third
        const right = p.position === 'br';
        return (
          <div key={p.id} className={`prop-lower slide-in ${right ? 'right' : ''}`} style={{ '--prop-accent': p.color || '#6d6af0' }}>
            {p.url && <img className="prop-lower-img" src={p.url} alt="" />}
            <div className="prop-lower-text">
              <div className="prop-lower-title">{p.title}</div>
              {p.subtitle && <div className="prop-lower-sub">{p.subtitle}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Audience screen: background → media → slide text → props → message.
 * alpha: see-through version for NDI key (no background, no media).
 */
export function AudienceView({ state, alpha = false }) {
  const s = state || {};
  const th = { ...DEFAULT_THEME, ...(s.theme || {}) };
  const needsClock = /\{(timer|clock)\}/i.test(s.message?.text || '');
  const now = useNow(needsClock);
  const text = s.slide?.text || '';
  const caption = s.slide?.caption || '';
  const shadow = th.outline ? '0 4px 22px rgba(0,0,0,.75), 0 0 3px rgba(0,0,0,.9)' : 'none';
  const box = s.design?.box || th.box || DEFAULT_BOX;
  const tr = th.transition || 'fade';
  const ms = tr === 'cut' ? 0 : th.transitionMs ?? 300;
  return (
    <>
      {!alpha && <div className="lyr" style={{ background: th.background }} />}
      {!alpha && <MediaLayer media={s.media} />}
      {s.slide && <ObjectsLayer objects={s.design?.objects} />}
      {(text || caption) && (
        <div className={`slide-layer tr-${tr}`} key={s.slide.key}
          style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, animationDuration: `${ms}ms`, alignItems: th.align === 'left' ? 'flex-start' : 'center' }}>
          <FitText
            className="slide-text"
            text={text}
            max={th.maxSize}
            style={{ fontFamily: FONTS[th.font] || FONTS.sans, color: th.color, textAlign: th.align, textTransform: th.uppercase ? 'uppercase' : 'none', textShadow: shadow, maxHeight: caption ? 'calc(100% - 80px)' : '100%' }}
          />
          {caption && <div className="slide-caption" style={{ color: th.color, textShadow: shadow, textAlign: th.align }}>{caption}</div>}
        </div>
      )}
      <PropsLayer props={s.props} />
      {s.message?.text && (
        <div className="lyr msg-layer">
          <div className="msg-bar fade" key={s.message.id}>{fillTokens(s.message.text, { timerMs: timerMs(s.timer, now), now })}</div>
        </div>
      )}
    </>
  );
}

/** Stage display for the platform: current + next slide, clock, countdown, message from the operator. */
export function StageView({ state }) {
  const s = state || {};
  const now = useNow(true);
  const left = timerMs(s.timer, now);
  const running = !!s.timer?.endAt;
  const clock = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="lyr stage-view">
      <div className="st-top">
        <div className="st-clock">{clock}</div>
        <div className="st-title">{s.slide?.title || ''}{s.slide ? <span className="st-count"> · {s.slide.index + 1}/{s.slide.total}</span> : null}</div>
        <div className={`st-timer ${running && left === 0 ? 'done' : ''} ${running && left > 0 && left < 60000 ? 'soon' : ''}`}>
          <small>{s.timer?.label || 'Timer'}</small>{formatDuration(left)}
        </div>
      </div>
      <div className="st-current">
        {s.slide?.group && <div className="st-group" style={{ background: groupColor(s.slide.group) }}>{s.slide.group}</div>}
        <FitText className="st-current-text" text={s.slide?.text || ''} max={120} min={40} />
      </div>
      <div className="st-next">
        <div className="st-next-label">Next{s.next?.group ? ` · ${s.next.group}` : ''}</div>
        <FitText className="st-next-text" text={s.next?.text || (s.slide ? '— end —' : '')} max={64} min={28} />
      </div>
      {s.stageMessage && <div className="st-message">{s.stageMessage}</div>}
    </div>
  );
}
