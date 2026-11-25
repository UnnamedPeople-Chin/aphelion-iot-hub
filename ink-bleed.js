/**
 * APHELION Ink-Bleed Theme Transition
 * WebGL2 ink-spread shader and tileable Perlin noise adapted from
 * codemure-official/ink-bleed-theme-changer (MIT License, Copyright (c) 2026 Codemure).
 * Zero-bundler vanilla JS port (no GSAP) with lazy html2canvas-pro viewport capture
 * and View Transitions API SVG fallback.
 */
(function () {
  'use strict';

  const HTML2CANVAS_CDN = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js';
  const NOISE_SIZE = 256;
  const NOISE_CELLS = 32;
  const DURATION_S = 1.25;
  const FADE_OUT_MS = 150;
  const RESIZE_DEBOUNCE_MS = 260;

  const BG_COLOR = { light: '#f8fafc', dark: '#020617' };
  const RIM_COLOR = {
    dark: [0.004, 0.012, 0.045],
    light: [1.0, 1.0, 1.0],
  };
  const PARAMS = { tendril: 1.05, noiseScale: 1.0, softness: 1.4, drift: 1.0 };
  const SPREAD = { growth: 0.7, cleanupFrom: 0.45, cleanupReach: 0.4, cleanupPow: 2 };

  const FULLSCREEN_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const INK_FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec2 uFromSize;
uniform vec2 uToSize;
uniform vec4 uFromMap;
uniform vec4 uToMap;
uniform float uCanvasScale;
uniform vec2 uRes;

uniform vec2 uCenter;
uniform float uRadius;
uniform float uCleanup;
uniform float uTime;
uniform float uRef;
uniform vec2 uSeed;
uniform mat2 uSeedRot;

uniform float uTendril;
uniform float uNoiseScale;
uniform float uSoftness;
uniform float uDrift;
uniform vec3 uRimColor;

out vec4 outColor;

const float A_LOBE = 0.22;
const float A_BLOB = 0.20;
const float A_SUM = A_LOBE + A_BLOB;
const float TENDRIL_REACH = 0.24;
const float FIBRE_PX = 1.8;
const float THIN_MAX_PX = 26.0;
const float SPECK_PX = 18.0;
const float HAZE_PX = 16.0;

uniform sampler2D uNoise;
const float INV_CELLS = 1.0 / ${NOISE_CELLS.toFixed(1)};

float gnoise(vec2 p) {
  return textureLod(uNoise, p * INV_CELLS, 0.0).r * 2.0 - 1.0;
}

float gnoise2(vec2 p) {
  return textureLod(uNoise, p * INV_CELLS, 0.0).g * 2.0 - 1.0;
}

const mat2 OCT = mat2(0.8, 0.6, -0.6, 0.8) * 2.03;

float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = OCT * p + 17.13; a *= 0.5; }
  return s / 0.875;
}

float fbm4(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * gnoise(p); p = OCT * p + 17.13; a *= 0.5; }
  return s / 0.9375;
}

float fbm5(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = OCT * p + 17.13; a *= 0.5; }
  return s / 0.96875;
}

vec3 sampleDoc(sampler2D tex, vec2 size, vec4 map, vec2 devPx) {
  vec2 texPx = devPx * map.x + map.yz;
  if (map.w > 0.5) texPx.y = size.y - texPx.y;
  vec2 uv = clamp(texPx, vec2(0.5), size - 0.5) / size;
  return texture(tex, uv).rgb;
}

void main() {
  vec2 devPx = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 css = devPx / uCanvasScale;
  vec2 rel = css - uCenter;
  float d = length(rel);
  float R = uRadius;
  float cleanup = uCleanup;

  float inner = R * (1.0 - A_SUM) + cleanup - FIBRE_PX - THIN_MAX_PX - uSoftness * 2.0;
  float outer = R * (1.0 + A_SUM) * (1.0 + TENDRIL_REACH * uTendril) + cleanup + FIBRE_PX + SPECK_PX + uSoftness * 2.0;
  if (d < inner) {
    outColor = vec4(sampleDoc(uTo, uToSize, uToMap, devPx), 1.0);
    return;
  }
  if (d > outer) {
    outColor = vec4(sampleDoc(uFrom, uFromSize, uFromMap, devPx), 1.0);
    return;
  }

  float t = uTime * uDrift;
  vec2 p = rel / uRef;
  vec2 dir = uSeedRot * (rel / max(d, 1e-3));
  float ns = uNoiseScale;

  vec2 q = p * (2.4 * ns) + uSeed;
  vec2 w = vec2(
    fbm3(q + vec2(0.0, 0.31 * t)),
    fbm3(q + vec2(5.2, 1.3) - vec2(0.27 * t, 0.0))
  );

  float blob = fbm5(q + 2.3 * w + vec2(0.12 * t, -0.08 * t));
  vec2 lq = dir * 0.9 + uSeed.yx * 0.37 + vec2(0.06 * t);
  float lobes = gnoise(lq) * 0.75 + gnoise(lq * 2.1 + 9.1) * 0.25;
  float reach = clamp(1.0 + A_LOBE * 1.6 * lobes + A_BLOB * 1.5 * blob, 1.0 - A_SUM, 1.0 + A_SUM);
  float f = d - R * reach;

  float gate = smoothstep(-0.35, 0.4, fbm3(dir * 1.6 + uSeed * 0.61 + 3.7));
  vec2 tq = dir * (2.2 * ns) + (d / uRef) * vec2(2.6, -1.9) * ns + 1.2 * w + uSeed * 1.7 + vec2(0.0, 0.18 * t);
  float n = fbm4(tq);
  float ridgePx = abs(n) * max(d, 24.0) / (4.0 * ns);
  float lenN = gnoise(dir * 3.1 + uSeed * 0.43 + vec2(0.1 * t)) * 0.5 + 0.5;
  float L = uTendril * TENDRIL_REACH * R * gate * (0.35 + 0.65 * lenN);
  float along = clamp(f / max(L, 1.0), 0.0, 1.0);
  float width = clamp(R * 0.022, 1.5, 9.0) * (1.0 - along * along) * gate;
  float ft = max(f - L, ridgePx - width);
  float k = 6.0;
  float hh = clamp(0.5 + 0.5 * (ft - f) / k, 0.0, 1.0);
  f = mix(ft, f, hh) - k * hh * (1.0 - hh);

  vec2 fq = css * 0.34 + uSeed * 13.0;
  float fibre = gnoise2(fq) * 0.65 + gnoise2(OCT * fq + 5.3) * 0.35;
  f += fibre * FIBRE_PX;
  f -= cleanup;

  float soft = max(uSoftness, 0.6);
  float inked = 1.0 - smoothstep(-soft, soft, f);

  float thinW = mix(3.0, THIN_MAX_PX, clamp(blob * 0.8 + 0.3, 0.0, 1.0));
  float density = mix(0.6, 1.0, smoothstep(0.0, thinW, -f));
  float cov = inked * density;

  float hazeW = mix(4.0, HAZE_PX, clamp(0.5 + 0.5 * blob, 0.0, 1.0));
  float haze = (1.0 - smoothstep(0.0, hazeW, f)) * smoothstep(-0.3, 0.6, 0.35 * fibre + w.x);
  cov = max(cov, haze * 0.24 * step(0.0, f));

  float ahead = clamp(f / SPECK_PX, 0.0, 1.0);
  if (f > 0.0 && ahead < 1.0) {
    float sn = gnoise2(css * 0.55 + uSeed * 7.0 + 41.0) * 0.5 + 0.5;
    float th = mix(0.80, 0.96, ahead);
    cov = max(cov, smoothstep(th, th + 0.04, sn) * 0.75 * (1.0 - ahead));
  }

  vec3 from = sampleDoc(uFrom, uFromSize, uFromMap, devPx);
  vec3 to = sampleDoc(uTo, uToSize, uToMap, devPx);
  vec3 col = mix(from, to, cov);

  float rimX = (f + soft * 1.1) / (soft * 1.4 + 1.2);
  float rim = exp(-rimX * rimX) * inked;
  col = mix(col, uRimColor, rim * 0.45);

  outColor = vec4(col, 1.0);
}`;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildNoiseChannel(rand) {
    const gx = new Float32Array(NOISE_CELLS * NOISE_CELLS);
    const gy = new Float32Array(NOISE_CELLS * NOISE_CELLS);
    for (let i = 0; i < gx.length; i++) {
      const a = rand() * Math.PI * 2;
      gx[i] = Math.cos(a);
      gy[i] = Math.sin(a);
    }
    const tpc = NOISE_SIZE / NOISE_CELLS;
    const out = new Float32Array(NOISE_SIZE * NOISE_SIZE);
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const at = (cx, cy) => ((cy + NOISE_CELLS) % NOISE_CELLS) * NOISE_CELLS + ((cx + NOISE_CELLS) % NOISE_CELLS);

    for (let y = 0; y < NOISE_SIZE; y++) {
      const py = (y + 0.5) / tpc;
      const cy = Math.floor(py);
      const fy = py - cy;
      const v = fade(fy);
      for (let x = 0; x < NOISE_SIZE; x++) {
        const px = (x + 0.5) / tpc;
        const cx = Math.floor(px);
        const fx = px - cx;
        const u = fade(fx);
        const i00 = at(cx, cy), i10 = at(cx + 1, cy), i01 = at(cx, cy + 1), i11 = at(cx + 1, cy + 1);
        const n00 = gx[i00] * fx + gy[i00] * fy;
        const n10 = gx[i10] * (fx - 1) + gy[i10] * fy;
        const n01 = gx[i01] * fx + gy[i01] * (fy - 1);
        const n11 = gx[i11] * (fx - 1) + gy[i11] * (fy - 1);
        const nx0 = n00 + (n10 - n00) * u;
        const nx1 = n01 + (n11 - n01) * u;
        out[y * NOISE_SIZE + x] = nx0 + (nx1 - nx0) * v;
      }
    }
    for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i] * 1.45));
    return out;
  }

  function createNoiseTexture(gl) {
    const rand = mulberry32(0x1b1eed);
    const ch = [buildNoiseChannel(rand), buildNoiseChannel(rand), buildNoiseChannel(rand), buildNoiseChannel(rand)];
    const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
    for (let i = 0; i < NOISE_SIZE * NOISE_SIZE; i++) {
      for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round((ch[c][i] * 0.5 + 0.5) * 255);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NOISE_SIZE, NOISE_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return tex;
  }

  function createProgram(gl, vertSrc, fragSrc) {
    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(sh) || '';
        gl.deleteShader(sh);
        throw new Error('Shader error: ' + log);
      }
      return sh;
    }
    const program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, vertSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('Program link error: ' + (gl.getProgramInfoLog(program) || ''));
    }
    const cache = new Map();
    return {
      program,
      uniform(name) {
        if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
        return cache.get(name);
      },
    };
  }

  class InkRenderer {
    constructor(canvas, gl) {
      this.canvas = canvas;
      this.gl = gl;
      this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      this.textures = new Map();
      this.composites = [];
      this.activeComposite = -1;
      this.canvasScale = 1;
      this.lost = false;
      this.init();
    }

    static create(canvas) {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      });
      if (!gl) return null;
      try {
        return new InkRenderer(canvas, gl);
      } catch (err) {
        console.warn('[aphelion-ink] WebGL2 init failed, using fallback:', err);
        return null;
      }
    }

    init() {
      const gl = this.gl;
      this.program = createProgram(gl, FULLSCREEN_VERT, INK_FRAG);
      this.vao = gl.createVertexArray();
      this.noise = createNoiseTexture(gl);
      this.composites = [];
      this.activeComposite = -1;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    }

    resize(scale) {
      const rect = this.canvas.getBoundingClientRect();
      const cw = rect.width || document.documentElement.clientWidth;
      const ch = rect.height || window.innerHeight;
      const w = Math.max(1, Math.round(cw * scale));
      const h = Math.max(1, Math.round(ch * scale));
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
      this.canvasScale = cw > 0 ? w / cw : scale;
    }

    createTex() {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    }

    upload(snapshot) {
      if (this.lost) return;
      const gl = this.gl;
      let entry = this.textures.get(snapshot.theme);
      if (!entry) {
        entry = { texture: this.createTex(), width: 0, height: 0, scale: 1, key: '', scrollX: 0, scrollY: 0 };
        this.textures.set(snapshot.theme, entry);
      }
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, snapshot.canvas);
      entry.width = snapshot.canvas.width;
      entry.height = snapshot.canvas.height;
      entry.scale = snapshot.scale;
      entry.key = snapshot.key;
      entry.scrollX = snapshot.scrollX;
      entry.scrollY = snapshot.scrollY;
    }

    hasValid(theme, key) {
      return !this.lost && this.textures.get(theme)?.key === key;
    }

    invalidateAll() {
      for (const entry of this.textures.values()) entry.key = '';
    }

    ensureComposite(index) {
      const gl = this.gl;
      const { width, height } = this.canvas;
      let c = this.composites[index];
      if (!c) {
        const fb = gl.createFramebuffer();
        c = { texture: this.createTex(), framebuffer: fb, width: 0, height: 0, scrollX: 0, scrollY: 0 };
        this.composites[index] = c;
      }
      if (c.width !== width || c.height !== height) {
        gl.bindTexture(gl.TEXTURE_2D, c.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, c.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, c.texture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        c.width = width;
        c.height = height;
      }
      return c;
    }

    freeze(frame) {
      if (this.lost) return false;
      const gl = this.gl;
      const idx = this.activeComposite === 0 ? 1 : 0;
      const target = this.ensureComposite(idx);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      const ok = this.render(frame);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) return false;
      target.scrollX = window.scrollX;
      target.scrollY = window.scrollY;
      this.activeComposite = idx;
      return true;
    }

    sampler(source) {
      if (source === 'composite') {
        const c = this.composites[this.activeComposite];
        if (!c) return null;
        return {
          texture: c.texture,
          width: c.width,
          height: c.height,
          ratio: 1,
          offsetX: Math.round((window.scrollX - c.scrollX) * this.canvasScale),
          offsetY: Math.round((window.scrollY - c.scrollY) * this.canvasScale),
          flipY: true,
        };
      }
      const t = this.textures.get(source);
      if (!t) return null;
      return {
        texture: t.texture,
        width: t.width,
        height: t.height,
        ratio: t.scale / this.canvasScale,
        offsetX: Math.round((window.scrollX - t.scrollX) * t.scale),
        offsetY: Math.round((window.scrollY - t.scrollY) * t.scale),
        flipY: false,
      };
    }

    render(frame) {
      const from = this.sampler(frame.from);
      const to = this.sampler(frame.to);
      if (!from || !to) return false;

      const gl = this.gl;
      const { program, uniform } = this.program;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(program);
      gl.bindVertexArray(this.vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, from.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, to.texture);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.noise);

      gl.uniform1i(uniform('uFrom'), 0);
      gl.uniform1i(uniform('uTo'), 1);
      gl.uniform1i(uniform('uNoise'), 2);
      gl.uniform2f(uniform('uFromSize'), from.width, from.height);
      gl.uniform2f(uniform('uToSize'), to.width, to.height);
      gl.uniform4f(uniform('uFromMap'), from.ratio, from.offsetX, from.offsetY, from.flipY ? 1 : 0);
      gl.uniform4f(uniform('uToMap'), to.ratio, to.offsetX, to.offsetY, to.flipY ? 1 : 0);
      gl.uniform1f(uniform('uCanvasScale'), this.canvasScale);
      gl.uniform2f(uniform('uRes'), this.canvas.width, this.canvas.height);
      gl.uniform2f(uniform('uCenter'), frame.center.x, frame.center.y);
      gl.uniform1f(uniform('uRadius'), frame.radius);
      gl.uniform1f(uniform('uCleanup'), frame.cleanup);
      gl.uniform1f(uniform('uTime'), frame.time);
      gl.uniform1f(uniform('uRef'), Math.max(this.canvas.width, this.canvas.height) / this.canvasScale);
      gl.uniform2f(uniform('uSeed'), frame.seed.x, frame.seed.y);
      const cos = Math.cos(frame.seed.angle);
      const sin = Math.sin(frame.seed.angle);
      gl.uniformMatrix2fv(uniform('uSeedRot'), false, [cos, sin, -sin, cos]);

      gl.uniform1f(uniform('uTendril'), PARAMS.tendril);
      gl.uniform1f(uniform('uNoiseScale'), PARAMS.noiseScale);
      gl.uniform1f(uniform('uSoftness'), PARAMS.softness);
      gl.uniform1f(uniform('uDrift'), PARAMS.drift);
      gl.uniform3fv(uniform('uRimColor'), RIM_COLOR[frame.to]);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    }
  }

  // Lazy-load html2canvas-pro after page paint
  let h2cPromise = null;
  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!h2cPromise) {
      h2cPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = HTML2CANVAS_CDN;
        s.async = true;
        s.onload = () => (window.html2canvas ? resolve(window.html2canvas) : reject(new Error('html2canvas missing')));
        s.onerror = () => reject(new Error('Failed to load html2canvas-pro'));
        document.head.appendChild(s);
      });
    }
    return h2cPromise;
  }

  function renderScale() {
    const cap = window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  function snapshotKey(scale, stateRev) {
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;
    const sy = Math.round(window.scrollY);
    return `${w}x${h}@${scale}#${sy}:r${stateRev}`;
  }

  function farthestCorner(p) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return Math.max(
      Math.hypot(p.x, p.y),
      Math.hypot(w - p.x, p.y),
      Math.hypot(p.x, h - p.y),
      Math.hypot(w - p.x, h - p.y)
    ) + 6;
  }

  function randomSeed() {
    return { x: Math.random() * 64 - 32, y: Math.random() * 64 - 32, angle: Math.random() * Math.PI * 2 };
  }

  async function captureViewport(theme, scale, maxTexSize, stateRev) {
    const html2canvas = await loadHtml2Canvas();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const safeScale = Math.min(scale, maxTexSize / Math.max(1, vw), maxTexSize / Math.max(1, vh));
    const key = snapshotKey(scale, stateRev);

    // Record live sticky offsets and checkbox states before cloning
    const stickyEls = Array.from(document.querySelectorAll('header.sticky, div.sticky'));
    const stickyTops = stickyEls.map((el) => el.getBoundingClientRect().top);
    const liveCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).map((cb) => cb.checked);

    const canvas = await html2canvas(document.body, {
      scale: safeScale,
      backgroundColor: BG_COLOR[theme],
      x: sx,
      y: sy,
      width: vw,
      height: vh,
      scrollX: 0,
      scrollY: 0,
      windowWidth: vw,
      windowHeight: vh,
      logging: false,
      useCORS: true,
      ignoreElements: (el) => el.id === 'inkBleedCanvas' || el.id === 'aphelionInkSvg',
      onclone: (doc) => {
        doc.documentElement.classList.toggle('dark', theme === 'dark');
        // Pin sticky chrome to exact visible viewport Y when page is scrolled
        if (sy > 0) {
          const clonedStickies = doc.querySelectorAll('header.sticky, div.sticky');
          clonedStickies.forEach((el, idx) => {
            if (stickyTops[idx] !== undefined && stickyTops[idx] <= 80) {
              el.style.position = 'absolute';
              el.style.top = (sy + stickyTops[idx]) + 'px';
              el.style.left = '0';
              el.style.right = '0';
              el.style.width = '100%';
            }
          });
        }
        // Keep checkbox checkmarks synchronized
        const clonedCbs = doc.querySelectorAll('input[type="checkbox"]');
        clonedCbs.forEach((cb, idx) => {
          if (liveCheckboxes[idx] !== undefined) cb.checked = liveCheckboxes[idx];
        });
      },
    });

    return { theme, canvas, scale: safeScale, key, scrollX: sx, scrollY: sy };
  }

  function initAphelionThemeToggle() {
    const themeBtn = document.getElementById('themeToggle');
    const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
    const inkCanvas = document.getElementById('inkBleedCanvas');
    const inkThresholdEl = document.getElementById('inkThreshold');
    const inkTurbulenceEl = document.getElementById('inkTurbulence');
    const inkSweepGradEl = document.getElementById('inkSweepGrad');
    if (!themeBtn) return;

    const prefersDarkMql = window.matchMedia('(prefers-color-scheme: dark)');
    const prefersReducedMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)');

    function getStoredTheme() {
      try {
        const v = localStorage.getItem('aphelion_theme');
        return v === 'dark' || v === 'light' ? v : null;
      } catch (e) {
        return null;
      }
    }

    function getCurrentTheme() {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }

    function syncThemeUI() {
      const stored = getStoredTheme();
      const scheme = stored ?? 'light dark';
      if (colorSchemeMeta) colorSchemeMeta.content = scheme;
      const isDark = stored ? stored === 'dark' : prefersDarkMql.matches;
      document.documentElement.classList.toggle('dark', isDark);
      themeBtn.setAttribute('aria-label', isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
    }

    function applyThemeTarget(target) {
      const systemPref = prefersDarkMql.matches ? 'dark' : 'light';
      try {
        if (target === systemPref) {
          localStorage.removeItem('aphelion_theme');
        } else {
          localStorage.setItem('aphelion_theme', target);
        }
      } catch (e) {}
      if (colorSchemeMeta) {
        colorSchemeMeta.content = target === systemPref ? 'light dark' : target;
      }
      document.documentElement.classList.toggle('dark', target === 'dark');
      themeBtn.setAttribute('aria-label', target === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
    }

    syncThemeUI();

    prefersDarkMql.addEventListener('change', () => {
      if (!getStoredTheme()) syncThemeUI();
    });
    window.addEventListener('storage', (e) => {
      if (e.key === 'aphelion_theme') syncThemeUI();
    });

    // Tier 1: WebGL2 InkRenderer
    const renderer = inkCanvas ? InkRenderer.create(inkCanvas) : null;
    let stateRev = 0;
    let captureGen = 0;
    let capturing = false;
    let captureQueued = false;
    let captureTimer = 0;

    let activeFrame = null;
    let animRaf = 0;
    let fadeTimer = 0;
    let animStart = 0;
    let lastProgress = 0;
    let lastTime = 0;

    function buildCurrentFrame() {
      if (!activeFrame) return null;
      const { maxDist } = activeFrame;
      const linear = Math.min(1, lastTime / DURATION_S);
      const ramp = Math.max(0, (linear - SPREAD.cleanupFrom) / (1 - SPREAD.cleanupFrom));
      const cleanup =
        Math.pow(ramp, SPREAD.cleanupPow) * maxDist * SPREAD.cleanupReach +
        Math.max(0, (linear - 0.97) / 0.03) * maxDist;
      return {
        ...activeFrame,
        progress: lastProgress,
        time: lastTime,
        radius: lastProgress * maxDist * SPREAD.growth,
        cleanup,
      };
    }

    function cancelWebGL() {
      cancelAnimationFrame(animRaf);
      clearTimeout(fadeTimer);
      activeFrame = null;
      if (inkCanvas) {
        inkCanvas.classList.remove('is-active');
        inkCanvas.style.opacity = '0';
      }
    }

    function scheduleCapture(delay) {
      if (!renderer || renderer.lost || prefersReducedMotionMql.matches) return;
      clearTimeout(captureTimer);
      captureTimer = setTimeout(() => { void captureBoth(); }, delay);
    }

    async function captureBoth() {
      if (!renderer || renderer.lost || prefersReducedMotionMql.matches) return;
      if (capturing || activeFrame) {
        captureQueued = true;
        return;
      }
      const scale = renderScale();
      const key = snapshotKey(scale, stateRev);
      const cur = getCurrentTheme();
      const other = cur === 'dark' ? 'light' : 'dark';
      const needed = [cur, other].filter((t) => !renderer.hasValid(t, key));
      captureQueued = false;
      if (needed.length === 0) return;

      const gen = ++captureGen;
      capturing = true;
      try {
        for (const theme of needed) {
          const snap = await captureViewport(theme, scale, renderer.maxTextureSize, stateRev);
          if (gen !== captureGen) return;
          if (snap.key !== snapshotKey(renderScale(), stateRev)) {
            captureQueued = true;
            break;
          }
          renderer.upload(snap);
        }
      } catch (err) {
        console.warn('[aphelion-ink] Snapshot capture skipped:', err);
      } finally {
        capturing = false;
      }
      if (captureQueued) scheduleCapture(RESIZE_DEBOUNCE_MS);
    }

    if (renderer) {
      renderer.resize(renderScale());
      inkCanvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        renderer.lost = true;
        renderer.textures.clear();
        cancelWebGL();
      });
      inkCanvas.addEventListener('webglcontextrestored', () => {
        renderer.lost = false;
        renderer.init();
        scheduleCapture(100);
      });

      const onViewportChange = () => {
        renderer.resize(renderScale());
        if (activeFrame) {
          const f = buildCurrentFrame();
          if (f) renderer.render(f);
        }
        scheduleCapture(RESIZE_DEBOUNCE_MS);
      };
      window.addEventListener('resize', onViewportChange);
      window.addEventListener('scroll', () => scheduleCapture(RESIZE_DEBOUNCE_MS), { passive: true });
      prefersReducedMotionMql.addEventListener('change', () => scheduleCapture(0));

      // Expose invalidation hook for tabs, PIC filter, and checklist changes
      window.aphelionInkInvalidate = function () {
        stateRev++;
        renderer.invalidateAll();
        scheduleCapture(220);
      };

      // Warm snapshots after load + fonts so first paint is never blocked
      const startWarmup = () => {
        const ready = document.fonts ? document.fonts.ready : Promise.resolve();
        ready.then(() => scheduleCapture(180));
      };
      if (document.readyState === 'complete') {
        startWarmup();
      } else {
        window.addEventListener('load', startWarmup, { once: true });
      }
    }

    // Tier 2 fallback: View Transitions API + SVG organic ink filter
    let vtActive = null;
    let svgSeed = 7;

    function runViewTransitionFallback(target, center) {
      if (typeof document.startViewTransition !== 'function' || !inkThresholdEl) {
        applyThemeTarget(target);
        return;
      }
      if (vtActive) return;

      const ox = Math.round((center.x / Math.max(1, window.innerWidth)) * 100);
      const oy = Math.round((center.y / Math.max(1, window.innerHeight)) * 100);
      svgSeed = (svgSeed + 13) % 97 + 1;
      if (inkTurbulenceEl) inkTurbulenceEl.setAttribute('seed', String(svgSeed));
      if (inkSweepGradEl) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><radialGradient id="g" cx="${ox}%" cy="${oy}%" r="135%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#000"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>`;
        inkSweepGradEl.setAttribute('href', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      }
      inkThresholdEl.setAttribute('k4', '-0.56');
      document.documentElement.classList.add('theme-ink-transition');

      const vt = document.startViewTransition(() => applyThemeTarget(target));
      vtActive = vt;
      vt.ready.then(() => {
        const dur = 850;
        document.documentElement.animate(
          { opacity: [1, 1] },
          { duration: dur, easing: 'linear', pseudoElement: '::view-transition-new(root)', fill: 'both' }
        );
        const t0 = performance.now();
        function step(now) {
          const raw = Math.min((now - t0) / dur, 1);
          const eased = 1 - Math.pow(1 - raw, 3);
          inkThresholdEl.setAttribute('k4', (-0.56 + eased * 1.12).toFixed(4));
          if (raw < 1 && vtActive === vt) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }).catch(() => {});

      vt.finished.finally(() => {
        document.documentElement.classList.remove('theme-ink-transition');
        inkThresholdEl.setAttribute('k4', '0.56');
        vtActive = null;
      });
    }

    themeBtn.addEventListener('click', (event) => {
      const current = getCurrentTheme();
      const target = current === 'dark' ? 'light' : 'dark';

      if (prefersReducedMotionMql.matches) {
        cancelWebGL();
        applyThemeTarget(target);
        return;
      }

      // Click point (or button center for keyboard activation)
      const rect = themeBtn.getBoundingClientRect();
      const center = (event.clientX || event.clientY)
        ? { x: event.clientX, y: event.clientY }
        : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

      const scale = renderScale();
      const key = snapshotKey(scale, stateRev);
      const interrupting = activeFrame !== null;
      const canUseWebGL =
        renderer !== null &&
        !renderer.lost &&
        renderer.hasValid(target, key) &&
        (interrupting || renderer.hasValid(current, key));

      if (!canUseWebGL) {
        cancelWebGL();
        runViewTransitionFallback(target, center);
        if (renderer) scheduleCapture(0);
        return;
      }

      // WebGL2 ink-bleed transition (with mid-spread interruption freeze!)
      let fromSource = current;
      if (interrupting) {
        cancelAnimationFrame(animRaf);
        clearTimeout(fadeTimer);
        renderer.resize(scale);
        const frozen = buildCurrentFrame();
        fromSource = frozen && renderer.freeze(frozen) ? 'composite' : current;
      }

      activeFrame = {
        from: fromSource,
        to: target,
        center,
        maxDist: farthestCorner(center),
        seed: randomSeed(),
      };
      lastProgress = 0;
      lastTime = 0;

      renderer.resize(scale);
      const initial = buildCurrentFrame();
      if (initial) renderer.render(initial);

      inkCanvas.style.transition = 'none';
      inkCanvas.style.opacity = '1';
      inkCanvas.classList.add('is-active');
      applyThemeTarget(target);

      animStart = performance.now();
      function tick(now) {
        const elapsedS = (now - animStart) / 1000;
        const linear = Math.min(1, elapsedS / DURATION_S);
        // power3.out easing matching Codemure's organic deceleration
        lastProgress = 1 - Math.pow(1 - linear, 3);
        lastTime = Math.min(elapsedS, DURATION_S);

        const frame = buildCurrentFrame();
        if (frame) renderer.render(frame);

        if (linear < 1) {
          animRaf = requestAnimationFrame(tick);
        } else {
          // Smooth 150ms fade-out onto the already-flipped live DOM
          inkCanvas.style.transition = `opacity ${FADE_OUT_MS}ms linear`;
          inkCanvas.style.opacity = '0';
          fadeTimer = setTimeout(() => {
            activeFrame = null;
            inkCanvas.classList.remove('is-active');
            if (captureQueued) scheduleCapture(0);
          }, FADE_OUT_MS + 20);
        }
      }
      animRaf = requestAnimationFrame(tick);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAphelionThemeToggle, { once: true });
  } else {
    initAphelionThemeToggle();
  }
})();
