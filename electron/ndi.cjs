// NDI sender. Talks to the NDI runtime (Processing.NDI.Lib.x64.dll / libndi.so.6) through koffi.
// The runtime is bundled with the app from vendor/ndi, so church PCs need no NDI Tools install.
const fs = require('node:fs');
const path = require('node:path');

const FOURCC_BGRA = 'B'.charCodeAt(0) | ('G'.charCodeAt(0) << 8) | ('R'.charCodeAt(0) << 16) | ('A'.charCodeAt(0) << 24);
const FRAME_PROGRESSIVE = 1;
const TIMECODE_SYNTHESIZE = 9223372036854775807n; // INT64_MAX: let NDI make the timecode

let fns = null;
let loadError = null;
let runtimePath = null;

function candidatePaths() {
  const out = [];
  if (process.env.NDI_LIB_PATH) out.push(process.env.NDI_LIB_PATH); // for testing / custom installs
  if (process.platform === 'win32') {
    const dll = 'Processing.NDI.Lib.x64.dll';
    // 1. Bundled with the app (like EasyWorship): installer copies vendor/ndi -> resources/ndi
    if (process.resourcesPath) out.push(path.join(process.resourcesPath, 'ndi', dll));
    // 2. During development: the project's vendor/ndi folder
    out.push(path.join(__dirname, '..', 'vendor', 'ndi', dll));
    // 3. Fallback: an NDI runtime already installed on the PC (NDI Tools, vMix, etc.)
    for (const v of ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5', 'NDI_RUNTIME_DIR_V4']) {
      if (process.env[v]) out.push(path.join(process.env[v], dll));
    }
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    out.push(
      path.join(pf, 'NDI', 'NDI 6 Runtime', 'v6', dll),
      path.join(pf, 'NDI', 'NDI 6 Tools', 'Runtime', dll),
      path.join(pf, 'NDI', 'NDI 5 Runtime', 'v5', dll),
      path.join(pf, 'NDI', 'NDI 6 SDK', 'Bin', 'x64', dll),
    );
  } else if (process.platform === 'darwin') {
    out.push('/usr/local/lib/libndi.dylib', '/Library/NDI SDK for Apple/lib/macOS/libndi.dylib');
  } else {
    // Linux: bundled with the app, the project's vendor/ndi folder (development), then a system install
    for (const name of ['libndi.so.6', 'libndi.so.5', 'libndi.so']) {
      if (process.resourcesPath) out.push(path.join(process.resourcesPath, 'ndi', name));
      out.push(path.join(__dirname, '..', 'vendor', 'ndi', name));
    }
    if (process.env.NDI_RUNTIME_DIR_V6) out.push(path.join(process.env.NDI_RUNTIME_DIR_V6, 'libndi.so.6'));
    out.push('libndi.so.6', 'libndi.so.5', '/usr/lib/libndi.so', '/usr/local/lib/libndi.so', '/usr/lib/x86_64-linux-gnu/libndi.so.6');
  }
  return out;
}

function load() {
  if (fns || loadError) return !!fns;
  let koffi;
  try {
    koffi = require('koffi');
  } catch (e) {
    loadError = `koffi not installed (${e.message})`;
    return false;
  }
  let lib = null;
  for (const p of candidatePaths()) {
    if (path.isAbsolute(p) && !fs.existsSync(p)) continue;
    try {
      lib = koffi.load(p);
      runtimePath = p;
      break;
    } catch { /* try next */ }
  }
  if (!lib) {
    loadError = process.platform === 'win32'
      ? 'NDI file missing: put Processing.NDI.Lib.x64.dll in the vendor/ndi folder (see vendor/ndi/README.txt).'
      : 'NDI library missing: put libndi.so.6 (from the NDI SDK for Linux) in vendor/ndi, or install the NDI runtime (see vendor/ndi/README.txt).';
    return false;
  }
  try {
    const CreateT = koffi.struct('NDIlib_send_create_t', {
      p_ndi_name: 'const char *',
      p_groups: 'const char *',
      clock_video: 'bool',
      clock_audio: 'bool',
    });
    const VideoT = koffi.struct('NDIlib_video_frame_v2_t', {
      xres: 'int',
      yres: 'int',
      FourCC: 'uint32_t',
      frame_rate_N: 'int',
      frame_rate_D: 'int',
      picture_aspect_ratio: 'float',
      frame_format_type: 'int',
      timecode: 'int64_t',
      p_data: 'uint8_t *',
      line_stride_in_bytes: 'int',
      p_metadata: 'const char *',
      timestamp: 'int64_t',
    });
    fns = {
      initialize: lib.func('bool NDIlib_initialize()'),
      sendCreate: lib.func('void * NDIlib_send_create(const NDIlib_send_create_t *settings)'),
      sendVideo: lib.func('void NDIlib_send_send_video_v2(void *instance, const NDIlib_video_frame_v2_t *frame)'),
      connections: lib.func('int NDIlib_send_get_no_connections(void *instance, uint32_t timeout_ms)'),
      sendDestroy: lib.func('void NDIlib_send_destroy(void *instance)'),
      VideoT,
      CreateT,
    };
    if (!fns.initialize()) throw new Error('This computer’s processor is not supported by NDI.');
    return true;
  } catch (e) {
    fns = null;
    loadError = `NDI failed to start: ${e.message}`;
    return false;
  }
}

function status() {
  load();
  return { available: !!fns, error: loadError, runtimePath };
}

class Sender {
  constructor(name) {
    if (!load()) throw new Error(loadError);
    this.name = name;
    this.instance = fns.sendCreate({ p_ndi_name: name, p_groups: null, clock_video: false, clock_audio: false });
    if (!this.instance) throw new Error(`Could not create NDI source "${name}"`);
  }

  /** buf: BGRA pixels, width*height*4 bytes */
  send(buf, width, height, fps = 30) {
    if (!this.instance) return;
    fns.sendVideo(this.instance, {
      xres: width,
      yres: height,
      FourCC: FOURCC_BGRA,
      frame_rate_N: fps * 1000,
      frame_rate_D: 1000,
      picture_aspect_ratio: width / height,
      frame_format_type: FRAME_PROGRESSIVE,
      timecode: TIMECODE_SYNTHESIZE,
      p_data: buf,
      line_stride_in_bytes: width * 4,
      p_metadata: null,
      timestamp: 0n,
    });
  }

  connections() {
    return this.instance ? fns.connections(this.instance, 0) : 0;
  }

  destroy() {
    if (this.instance) fns.sendDestroy(this.instance);
    this.instance = null;
  }
}

/** Chromium gives premultiplied alpha; NDI expects straight alpha. Only matters for see-through output. */
function unpremultiply(buf) {
  for (let i = 0; i < buf.length; i += 4) {
    const a = buf[i + 3];
    if (a === 255 || a === 0) continue;
    const f = 255 / a;
    buf[i] = Math.min(255, Math.round(buf[i] * f));
    buf[i + 1] = Math.min(255, Math.round(buf[i + 1] * f));
    buf[i + 2] = Math.min(255, Math.round(buf[i + 2] * f));
  }
  return buf;
}

module.exports = { status, Sender, unpremultiply, FOURCC_BGRA };
