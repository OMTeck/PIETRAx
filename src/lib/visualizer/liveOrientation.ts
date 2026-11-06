/**
 * Camera geometry for the live view from the phone's orientation sensors.
 *
 * DeviceOrientation (W3C): device -> earth = Rz(alpha)·Rx(beta)·Ry(gamma), earth
 * X east, Y north, Z up; device x right, y to the top of the screen, z out of
 * the screen. The rear camera looks along −z. The screen's own rotation
 * (screen.orientation.angle) turns the camera frame about z. World used by the
 * renderer: x east, y up, z south (so x/z is the ground plane).
 */

export type Vec3 = [number, number, number];

const DEG = Math.PI / 180;

/** Column-major 3×3 camera -> world (y up). */
export function camToWorld(alpha: number, beta: number, gamma: number, screenAngle: number): Float32Array {
  const a = alpha * DEG, b = beta * DEG, g = gamma * DEG, s = screenAngle * DEG;
  const rz = (t: number) => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
  const rx = (t: number) => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
  const ry = (t: number) => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
  // Row-major 3×3 multiply.
  const mul = (p: number[], q: number[]) => {
    const o = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += p[r * 3 + k] * q[k * 3 + c];
    return o;
  };
  const earthToWorld = [1, 0, 0, 0, 0, 1, 0, -1, 0];
  const m = mul(mul(mul(mul(earthToWorld, rz(a)), rx(b)), ry(g)), rz(s));
  // To column-major for WebGL.
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

/** World ray through screen point s (0..1, y down). */
export function rayAt(R: Float32Array, sx: number, sy: number, tanV: number, aspect: number): Vec3 {
  const cx = (sx - 0.5) * 2 * tanV * aspect;
  const cy = -(sy - 0.5) * 2 * tanV;
  const cz = -1;
  return [
    R[0] * cx + R[3] * cy + R[6] * cz,
    R[1] * cx + R[4] * cy + R[7] * cz,
    R[2] * cx + R[5] * cy + R[8] * cz,
  ];
}

/** World point -> screen (0..1, y down), or null when behind the camera. */
export function project(R: Float32Array, p: Vec3, tanV: number, aspect: number): { x: number; y: number } | null {
  // camera = Rᵀ · p
  const cx = R[0] * p[0] + R[1] * p[1] + R[2] * p[2];
  const cy = R[3] * p[0] + R[4] * p[1] + R[5] * p[2];
  const cz = R[6] * p[0] + R[7] * p[1] + R[8] * p[2];
  if (cz > -1e-3) return null;
  return { x: 0.5 + cx / -cz / (2 * tanV * aspect), y: 0.5 - cy / -cz / (2 * tanV) };
}

/** Where the ray through s meets the floor (camHeight below the camera), within maxDist. */
export function floorPoint(R: Float32Array, sx: number, sy: number, tanV: number, aspect: number, camHeight: number, maxDist = 15): Vec3 | null {
  const r = rayAt(R, sx, sy, tanV, aspect);
  if (r[1] > -1e-3) return null;
  const t = camHeight / -r[1];
  const p: Vec3 = [r[0] * t, r[1] * t, r[2] * t];
  return Math.hypot(p[0], p[2]) <= maxDist ? p : null;
}

/** Horizontal unit direction of the ray through s (wall normal facing away from the camera). */
export function horizontalDir(R: Float32Array, sx: number, sy: number, tanV: number, aspect: number): Vec3 {
  const r = rayAt(R, sx, sy, tanV, aspect);
  const l = Math.hypot(r[0], r[2]) || 1;
  return [r[0] / l, 0, r[2] / l];
}

/**
 * tan(half vertical FOV) of the displayed view. Phone main cameras cover about
 * 65° along the sensor's long side; the cover crop shows `coverY` of the
 * video's height.
 */
export function displayedTanV(videoW: number, videoH: number, coverY: number, longSideFovDeg = 65): number {
  const tanLong = Math.tan((longSideFovDeg / 2) * DEG);
  const tanVideoV = videoH >= videoW ? tanLong : tanLong * (videoH / Math.max(1, videoW));
  return tanVideoV * coverY;
}

/** Asks iOS for motion-sensor access; must run inside a tap handler. Resolves true if usable. */
export async function requestOrientationPermission(): Promise<boolean> {
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!DOE) return false;
  if (typeof DOE.requestPermission !== 'function') return true;
  try {
    return (await DOE.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
