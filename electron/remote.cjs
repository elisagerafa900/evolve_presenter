// Phone remote: a small web page on the church Wi-Fi. Open http://<this-pc>:4320 on a phone,
// type the 4-digit PIN shown in the app, then move slides, pick songs and clear the screen.
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');

const PREFERRED_PORT = 4320;
const COMMANDS = new Set(['next', 'prev', 'goto', 'clearAll', 'clearSlide', 'clearMedia', 'clearMessage', 'clearProps', 'action']);
const ACTION = /^(next|prev|clearAll|clearSlide|clearMedia|clearMessage|clearProps|macro:[\w-]{1,40})$/;

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^169\.254\./.test(a.address)) continue; // no network yet
      if (/vEthernet|VirtualBox|VMware|docker|br-|veth|WSL/i.test(name)) continue; // virtual adapters
      out.push(a.address);
    }
  }
  return out;
}

const newPin = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

function createRemote({ onCommand, pin: savedPin }) {
  let server = null;
  let port = 0;
  let pin = /^\d{4}$/.test(savedPin || '') ? savedPin : newPin();
  let state = null;
  const clients = new Set();
  const failures = new Map(); // ip -> { n, until }

  const blocked = (ip) => (failures.get(ip)?.until || 0) > Date.now();
  function checkPin(req, given) {
    const ip = req.socket.remoteAddress || '';
    if (blocked(ip)) return 429;
    const ok = typeof given === 'string' && /^\d{4}$/.test(given)
      && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(pin));
    if (ok) { failures.delete(ip); return 200; }
    const f = failures.get(ip) || { n: 0, until: 0 };
    f.n += 1;
    if (f.n >= 8) { f.until = Date.now() + 5 * 60 * 1000; f.n = 0; } // 8 wrong PINs: wait 5 minutes
    failures.set(ip, f);
    return 401;
  }

  function send(res, code, body, type = 'application/json') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  }

  function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return send(res, 200, PAGE, 'text/html; charset=utf-8');
    if (url.pathname === '/api/state' && req.method === 'GET') {
      const c = checkPin(req, req.headers['x-pin']);
      return c === 200 ? send(res, 200, state || {}) : send(res, c, { error: c === 429 ? 'Too many tries. Wait 5 minutes.' : 'Wrong PIN' });
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      const c = checkPin(req, url.searchParams.get('pin'));
      if (c !== 200) return send(res, c, { error: 'Wrong PIN' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(state || {})}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    // Stream Deck / Companion: GET or POST /api/trigger/<action>?pin=1234
    const trig = /^\/api\/trigger\/([\w:-]+)$/.exec(url.pathname);
    if (trig && (req.method === 'GET' || req.method === 'POST')) {
      req.resume();
      const c = checkPin(req, url.searchParams.get('pin') || req.headers['x-pin']);
      if (c !== 200) return send(res, c, { error: c === 429 ? 'Too many tries. Wait 5 minutes.' : 'Wrong PIN' });
      if (!ACTION.test(trig[1])) return send(res, 400, { error: 'Unknown action' });
      onCommand({ cmd: 'action', action: trig[1] });
      return send(res, 200, { ok: true, action: trig[1] });
    }
    if (url.pathname === '/api/cmd' && req.method === 'POST') {
      const c = checkPin(req, req.headers['x-pin']);
      if (c !== 200) { req.resume(); return send(res, c, { error: 'Wrong PIN' }); }
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 2000) req.destroy(); });
      req.on('end', () => {
        let cmd;
        try { cmd = JSON.parse(body); } catch { return send(res, 400, { error: 'Bad request' }); }
        if (!cmd || !COMMANDS.has(cmd.cmd)) return send(res, 400, { error: 'Unknown command' });
        onCommand({
          cmd: cmd.cmd,
          presId: typeof cmd.presId === 'string' ? cmd.presId.slice(0, 40) : undefined,
          index: Number.isInteger(cmd.index) ? cmd.index : undefined,
          action: typeof cmd.action === 'string' && ACTION.test(cmd.action) ? cmd.action : undefined,
        });
        send(res, 200, { ok: true });
      });
      return;
    }
    send(res, 404, { error: 'Not found' });
  }

  return {
    get pin() { return pin; },
    get running() { return !!server; },
    start() {
      if (server) return Promise.resolve(this.info());
      return new Promise((resolve) => {
        const srv = http.createServer(handle);
        const listen = (p) => srv.listen(p, '0.0.0.0');
        srv.once('error', () => { listen(0); }); // 4320 busy: use any free port
        srv.on('listening', () => { server = srv; port = srv.address().port; resolve(this.info()); });
        listen(PREFERRED_PORT);
      });
    },
    stop() {
      for (const c of clients) c.end();
      clients.clear();
      server?.close();
      server = null;
      port = 0;
    },
    newPin() { pin = newPin(); for (const c of clients) c.end(); clients.clear(); return pin; },
    push(s) {
      state = s;
      const data = `data: ${JSON.stringify(s)}\n\n`;
      for (const c of clients) c.write(data);
    },
    info() {
      const urls = server ? lanAddresses().map((ip) => `http://${ip}:${port}`) : [];
      return { running: !!server, port, pin, urls, clients: clients.size };
    },
  };
}

// ---------- the page the phone opens ----------
const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f1014"><title>Evolve Remote</title>
<style>
:root{--bg:#0f1014;--s:#17181d;--s2:#1f2027;--line:#2a2c36;--t:#ececf1;--m:#8d8f9b;--a:#8583f2;--live:#ff6369}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--t);font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{padding:14px 14px calc(150px + env(safe-area-inset-bottom))}
h1{font-size:15px;margin:0 0 12px;display:flex;align-items:center;gap:8px;color:var(--m);font-weight:600}
h1 b{color:var(--t)} .dot{width:10px;height:10px;border-radius:3px;background:linear-gradient(135deg,var(--a),var(--live));transform:rotate(45deg)}
.card{background:var(--s);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:12px}
.now{min-height:120px;display:flex;flex-direction:column;gap:6px}
.lbl{font-size:12px;color:var(--m);font-weight:650;display:flex;justify-content:space-between;gap:8px}
.big{font-size:20px;font-weight:600;white-space:pre-line}
.next{color:var(--m);white-space:pre-line;font-size:14px}
.tabs{display:flex;gap:6px;margin-bottom:10px}
.tabs button{flex:1;height:38px;border-radius:10px;border:1px solid var(--line);background:var(--s);color:var(--m);font-weight:650;font-size:14px}
.tabs button.on{background:var(--s2);color:var(--t);border-color:var(--a)}
.list{display:flex;flex-direction:column;gap:6px}
.item{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--s);color:var(--t);text-align:left;font-size:14px;width:100%}
.item.live{border-color:var(--live);background:rgba(255,99,105,.12)}
.item .n{color:var(--m);min-width:20px;font-variant-numeric:tabular-nums}
.item .tx{white-space:pre-line;flex:1}
.grp{font-size:11px;font-weight:700;color:#fff;border-radius:6px;padding:1px 6px;margin-bottom:3px;display:inline-block}
.bar{position:fixed;left:0;right:0;bottom:0;background:rgba(15,16,20,.94);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:10px 12px calc(10px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px}
.row{display:flex;gap:8px}
.btn{flex:1;height:58px;border-radius:14px;border:1px solid var(--line);background:var(--s2);color:var(--t);font-size:18px;font-weight:700}
.btn.p{background:var(--a);border-color:var(--a);color:#fff;flex:1.6}
.sm{height:38px;font-size:13px;font-weight:650;border-radius:10px}
.clr{background:transparent}
.pin{max-width:320px;margin:15vh auto 0;text-align:center}
.pin input{width:100%;height:64px;font-size:34px;letter-spacing:14px;text-align:center;border-radius:14px;border:1px solid var(--line);background:var(--s);color:var(--t);margin:14px 0}
.err{color:var(--live);min-height:20px;font-size:14px}
.muted{color:var(--m);font-size:13px}
</style></head><body>
<div id="app"></div>
<script>
const C={verse:'#3b82f6',chorus:'#ef4444',refrain:'#ef4444',hook:'#ef4444',pre:'#f59e0b',bridge:'#a855f7',tag:'#ec4899',blank:'#475569'};
const color=g=>{g=(g||'').toLowerCase();for(const k in C)if(g.startsWith(k))return C[k];return /^(intro|outro|ending|interlude|instrumental|vamp)/.test(g)?'#10b981':'#64748b'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
let pin=''; try{pin=localStorage.getItem('ep.pin')||''}catch{}
let st=null, view='slides', es=null, err='';
const app=document.getElementById('app');
async function api(path,opt={}){const r=await fetch(path,{...opt,headers:{'Content-Type':'application/json','x-pin':pin}});if(r.status===401||r.status===429){const j=await r.json().catch(()=>({}));logout(j.error||'Wrong PIN');throw 0}return r.json()}
function logout(m){pin='';try{localStorage.removeItem('ep.pin')}catch{};es&&es.close();es=null;err=m||'';render()}
function cmd(c,extra={}){if(navigator.vibrate)navigator.vibrate(10);api('/api/cmd',{method:'POST',body:JSON.stringify({cmd:c,...extra})}).catch(()=>{})}
function connect(){es&&es.close();es=new EventSource('/api/events?pin='+encodeURIComponent(pin));es.onmessage=e=>{st=JSON.parse(e.data);render()};es.onerror=()=>{api('/api/state').then(s=>{st=s;render()}).catch(()=>{})}}
async function login(v){pin=v;try{st=await api('/api/state');try{localStorage.setItem('ep.pin',pin)}catch{};err='';connect();render()}catch{}}
function render(){
 if(!pin){app.innerHTML='<div class="pin"><h1 style="justify-content:center"><span class="dot"></span>Evolve <b>Remote</b></h1><div class="muted">Type the 4-digit PIN shown in Evolve Presenter (📱 Remote).</div><input id="p" inputmode="numeric" maxlength="4" autocomplete="off" autofocus><div class="err">'+esc(err)+'</div></div>';const i=document.getElementById('p');i.oninput=()=>{if(/^\\d{4}$/.test(i.value))login(i.value)};return}
 const s=st||{}, live=s.live, cur=s.current, slides=cur?.slides||[];
 const now=live&&cur&&live.presId===cur.id?slides[live.index]:null, nxt=now?slides[live.index+1]:null;
 let h='<h1><span class="dot"></span>Evolve <b>Remote</b></h1>';
 h+='<div class="card now"><div class="lbl"><span>'+(now?esc(cur.title)+' · '+(live.index+1)+'/'+slides.length:'Nothing on screen')+'</span>'+(now&&now.group?'<span class="grp" style="background:'+color(now.group)+'">'+esc(now.group)+'</span>':'')+'</div><div class="big">'+(now?esc(now.text)||'<span class="muted">(blank)</span>':'<span class="muted">Tap a slide or Next</span>')+'</div>'+(nxt?'<div class="next">Next: '+esc(nxt.text)+'</div>':'')+'</div>';
 h+='<div class="tabs"><button data-v="slides" class="'+(view==='slides'?'on':'')+'">Slides</button><button data-v="playlist" class="'+(view==='playlist'?'on':'')+'">'+esc(s.playlist?.name||'Playlist')+'</button>'+((s.macros||[]).length?'<button data-v="macros" class="'+(view==='macros'?'on':'')+'">Macros</button>':'')+'</div><div class="list">';
 if(view==='slides'){ if(!cur)h+='<div class="muted">Pick a song in the playlist.</div>';
  slides.forEach((sl,i)=>{const on=live&&live.presId===cur.id&&live.index===i;h+='<button class="item '+(on?'live':'')+'" data-go="'+i+'"><span class="n">'+(i+1)+'</span><span class="tx">'+(sl.group?'<span class="grp" style="background:'+color(sl.group)+'">'+esc(sl.group)+'</span><br>':'')+(esc(sl.text)||'<span class="muted">(blank)</span>')+'</span></button>'})
 } else if(view==='macros'){ (s.macros||[]).forEach(m=>{h+='<button class="item" data-mac="'+esc(m.id)+'"><span class="n" style="color:'+esc(m.color||'#8583f2')+'">●</span><span class="tx">'+esc(m.name)+'</span></button>'})
 } else { (s.playlist?.items||[]).forEach((it,i)=>{const on=live&&live.presId===it.presId;h+='<button class="item '+(on?'live':'')+'" data-pres="'+esc(it.presId)+'"><span class="n">'+(i+1)+'</span><span class="tx">'+esc(it.title)+'</span></button>'}); if(!(s.playlist?.items||[]).length)h+='<div class="muted">The playlist is empty.</div>'}
 h+='</div><div class="bar"><div class="row"><button class="btn" data-c="prev">‹ Prev</button><button class="btn p" data-c="next">Next ›</button></div><div class="row"><button class="btn sm clr" data-c="clearAll">Clear all</button><button class="btn sm clr" data-c="clearSlide">Slide</button><button class="btn sm clr" data-c="clearMedia">Media</button><button class="btn sm clr" data-c="clearProps">Props</button><button class="btn sm clr" data-c="clearMessage">Msg</button></div></div>';
 app.innerHTML=h;
 app.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;render()});
 app.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>cmd(b.dataset.c));
 app.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>cmd('goto',{presId:cur.id,index:+b.dataset.go}));
 app.querySelectorAll('[data-mac]').forEach(b=>b.onclick=()=>cmd('action',{action:'macro:'+b.dataset.mac}));
 app.querySelectorAll('[data-pres]').forEach(b=>b.onclick=()=>{cmd('goto',{presId:b.dataset.pres,index:0});view='slides'});
}
if(pin)login(pin);else render();
</script></body></html>`;

module.exports = { createRemote, lanAddresses };
