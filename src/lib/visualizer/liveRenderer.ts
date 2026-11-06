/**
 * WebGL compositor for the live camera mode: draws the camera frame and, inside
 * a soft mask, the material texture. Floors get a ground-plane perspective
 * (tiles shrink towards the horizon); walls are tiled flat. The camera's own
 * brightness modulates the stone so shadows and light falloff stay real.
 *
 * Coordinates: screen space s in [0,1]², y = 0 at the top. The video is
 * cover-fitted to the canvas; the mask is computed on the same cover-fitted
 * view, so mask texels line up with the screen.
 */

export type LiveSurfaceKind = 'floor' | 'wall';

export interface LiveDrawParams {
  kind: LiveSurfaceKind;
  /** Screen y (0 top .. 1 bottom) of the estimated horizon (floors). */
  horizon: number;
  /** Tile size multiplier (1 = default). */
  tileScale: number;
  /** Mean luma (0..1) of the masked region in the camera frame. */
  lumaMean: number;
  /** 0..1: how much the camera's light/shadow modulates the material. */
  lightStrength: number;
}

const VERT = `
attribute vec2 aPos;
varying vec2 vS;
void main() {
  vS = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vS;
uniform sampler2D uVideo;
uniform sampler2D uMask;
uniform sampler2D uTex;
uniform vec2 uCover;      // video uv scale for object-fit: cover
uniform float uAspect;    // canvas width / height
uniform float uTexAspect; // texture width / height
uniform int uKind;        // 0 floor, 1 wall
uniform float uHorizon;
uniform float uScale;
uniform float uLumaMean;
uniform float uLight;
uniform vec3 uTexAvg;
uniform float uHasMask;

void main() {
  vec2 vuv = (vS - 0.5) * uCover + 0.5;
  vec3 cam = texture2D(uVideo, vuv).rgb;
  float m = uHasMask > 0.5 ? texture2D(uMask, vS).r : 0.0;
  if (m < 0.004) { gl_FragColor = vec4(cam, 1.0); return; }

  vec2 uv;
  float far = 0.0;
  if (uKind == 0) {
    float dy = max(vS.y - uHorizon, 0.012);
    float depth = 1.0 / dy;
    uv = vec2((vS.x - 0.5) * uAspect * depth, depth) * uScale;
    // Fade to the stone's average colour where tiles get smaller than a few
    // pixels: kills the shimmer of a texture without mipmaps.
    far = smoothstep(0.10, 0.03, dy);
  } else {
    uv = vec2(vS.x * uAspect, vS.y) * uScale;
  }
  uv.x /= uTexAspect;
  vec3 stone = texture2D(uTex, fract(uv)).rgb;
  stone = mix(stone, uTexAvg, far);

  float luma = dot(cam, vec3(0.299, 0.587, 0.114));
  float ratio = clamp(luma / max(uLumaMean, 0.04), 0.35, 1.6);
  vec3 lit = stone * mix(1.0, ratio, uLight);
  gl_FragColor = vec4(mix(cam, lit, m), 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('shader');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'compile');
  return sh;
}

function makeTexture(gl: WebGLRenderingContext): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error('texture');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}

export class LiveRenderer {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private videoTex: WebGLTexture;
  private maskTex: WebGLTexture;
  private matTex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private texAspect = 1;
  private texAvg: [number, number, number] = [0.5, 0.5, 0.5];
  private hasMask = false;
  private hasMaterial = false;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    const prog = gl.createProgram();
    if (!prog) throw new Error('program');
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    for (const n of ['uVideo', 'uMask', 'uTex', 'uCover', 'uAspect', 'uTexAspect', 'uKind', 'uHorizon', 'uScale', 'uLumaMean', 'uLight', 'uTexAvg', 'uHasMask']) {
      this.loc[n] = gl.getUniformLocation(prog, n);
    }
    this.videoTex = makeTexture(gl);
    this.maskTex = makeTexture(gl);
    this.matTex = makeTexture(gl);
    gl.uniform1i(this.loc.uVideo, 0);
    gl.uniform1i(this.loc.uMask, 1);
    gl.uniform1i(this.loc.uTex, 2);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  /** Material texture (must be CORS-clean). Also records its average colour. */
  setMaterial(img: HTMLImageElement): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.matTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    this.texAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, 8, 8);
      const d = ctx.getImageData(0, 0, 8, 8).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      this.texAvg = [r / n / 255, g / n / 255, b / n / 255];
    }
    this.hasMaterial = true;
  }

  /** Soft mask, 0..255, w×h (screen aligned). Pass null to clear. */
  setMask(mask: Uint8Array | null, w: number, h: number): void {
    const gl = this.gl;
    this.hasMask = Boolean(mask);
    if (!mask) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mask);
  }

  draw(video: HTMLVideoElement, p: LiveDrawParams): void {
    const gl = this.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    gl.viewport(0, 0, cw, ch);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);

    const ac = cw / ch;
    const av = vw / vh;
    const cover = ac > av ? [1, av / ac] : [ac / av, 1];
    gl.uniform2f(this.loc.uCover, cover[0], cover[1]);
    gl.uniform1f(this.loc.uAspect, ac);
    gl.uniform1f(this.loc.uTexAspect, this.texAspect);
    gl.uniform1i(this.loc.uKind, p.kind === 'floor' ? 0 : 1);
    gl.uniform1f(this.loc.uHorizon, p.horizon);
    // Floors: about 3 tiles across the bottom edge at tileScale 1.
    const bottomDepth = 1 / Math.max(0.05, 1 - p.horizon);
    const scale = p.kind === 'floor'
      ? 3 / (ac * bottomDepth) / Math.max(0.2, p.tileScale)
      : 2.2 / ac / Math.max(0.2, p.tileScale);
    gl.uniform1f(this.loc.uScale, scale);
    gl.uniform1f(this.loc.uLumaMean, p.lumaMean);
    gl.uniform1f(this.loc.uLight, p.lightStrength);
    gl.uniform3f(this.loc.uTexAvg, this.texAvg[0], this.texAvg[1], this.texAvg[2]);
    gl.uniform1f(this.loc.uHasMask, this.hasMask && this.hasMaterial ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.videoTex);
    gl.deleteTexture(this.maskTex);
    gl.deleteTexture(this.matTex);
    gl.deleteProgram(this.prog);
  }
}

/** Draws the video cover-fitted to `aspect` into a w×h canvas context. */
export function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number): void {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const s = Math.max(w / vw, h / vh);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
}
