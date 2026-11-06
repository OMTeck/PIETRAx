/**
 * True AR (WebXR immersive-ar, e.g. Chrome on ARCore Android phones).
 *
 * The phone tracks the room in 3D, so the stone is anchored to the real floor
 * or wall: it stays put while the visitor walks around, tiles are at their
 * real size in metres, real furniture hides the floor where the device offers
 * depth sensing, and lighting follows the room's estimated light.
 *
 * - plane-detection: dresses detected floor / wall polygons (their real shape).
 * - hit-test fallback: if planes are not available, a tap places a patch on
 *   the surface under the reticle.
 * - depth-sensing (gpu-optimized): three.js writes the real-world depth into
 *   the depth buffer, so furniture occludes the floor.
 * - light-estimation: XREstimatedLight drives light + reflections.
 *
 * three.js is imported lazily, only when a session actually starts.
 */
import type * as ThreeNS from 'three';

type Three = typeof ThreeNS;

export type ArSurfaceKind = 'floor' | 'wall';
export type ArStatus = 'loading' | 'scanning' | 'ready' | 'placing';

export interface ArMaterialSpec {
  textureUrl: string;
  /** One piece (tile / slab) in centimetres. */
  tileWcm: number;
  tileHcm: number;
  /** Joint width in millimetres (0 = seamless). */
  groutMm: number;
  groutColor: string;
  /** Polished stone reflects more. */
  glossy: boolean;
}

export interface ArController {
  setMaterial(spec: ArMaterialSpec): Promise<void>;
  setKind(kind: ArSurfaceKind): void;
  /** Removes placed patches / wall selection. */
  clear(): void;
  end(): void;
}

export interface ArCallbacks {
  onStatus: (status: ArStatus) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

/** Whether this browser/device can run an immersive AR session. */
export async function isArSupported(): Promise<boolean> {
  try {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr?.isSessionSupported) return false;
    return await xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

/**
 * Requests the session. Must be called directly from a user gesture (tap),
 * before any other await, or the browser refuses it.
 */
export function requestArSession(overlay: HTMLElement): Promise<XRSession> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) return Promise.reject(new Error('WebXR unavailable'));
  const init: XRSessionInit & { depthSensing?: unknown } = {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['plane-detection', 'depth-sensing', 'light-estimation', 'dom-overlay', 'anchors'],
    domOverlay: { root: overlay },
    depthSensing: {
      usagePreference: ['gpu-optimized', 'cpu-optimized'],
      dataFormatPreference: ['luminance-alpha', 'float32', 'unsigned-short'],
    },
  };
  return xr.requestSession('immersive-ar', init as XRSessionInit);
}

/** Plane polygon (plane-space x/z, metres) -> geometry in plane space with UVs in tiles. */
export function planeGeometry(
  THREE: Three,
  polygon: { x: number; z: number }[],
  tileWm: number,
  tileHm: number,
): ThreeNS.BufferGeometry {
  // ShapeGeometry lives in XY; (x, -z) rotated -90° about X lands on (x, 0, z).
  const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p.x, -p.z)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / tileWm;
    uv[i * 2 + 1] = pos.getZ(i) / tileHm;
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geom;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('texture load failed'));
    img.src = src;
  });
}

/** One piece of stone (cover-cropped to the piece's proportions) with its joint baked in. */
async function pieceTexture(THREE: Three, renderer: ThreeNS.WebGLRenderer, spec: ArMaterialSpec): Promise<ThreeNS.CanvasTexture> {
  const img = await loadHtmlImage(spec.textureUrl);
  const aspect = spec.tileWcm / Math.max(1, spec.tileHcm);
  const long = 1024;
  const w = aspect >= 1 ? long : Math.round(long * aspect);
  const h = aspect >= 1 ? Math.round(long / aspect) : long;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
  if (spec.groutMm > 0) {
    const jointPx = Math.max(1, Math.round((spec.groutMm / 10 / spec.tileWcm) * w));
    ctx.fillStyle = spec.groutColor || '#d8d4cc';
    ctx.fillRect(w - jointPx, 0, jointPx, h);
    ctx.fillRect(0, h - jointPx, w, jointPx);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

export async function startAr(
  session: XRSession,
  opts: { kind: ArSurfaceKind; material: ArMaterialSpec; callbacks: ArCallbacks },
): Promise<ArController> {
  const { callbacks } = opts;
  callbacks.onStatus('loading');
  const THREE = await import('three');
  const { XREstimatedLight } = await import('three/examples/jsm/webxr/XREstimatedLight.js');

  let kind = opts.kind;
  let spec = opts.material;
  let tileWm = Math.max(0.05, spec.tileWcm / 100);
  let tileHm = Math.max(0.05, spec.tileHcm / 100);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.domElement.style.display = 'none';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);

  // Default light until the device's light estimate arrives.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8d8579, 2.2);
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(0.5, 2, 0.8);
  scene.add(hemi, sun);
  const xrLight = new XREstimatedLight(renderer);
  xrLight.addEventListener('estimationstart', () => {
    scene.add(xrLight);
    scene.remove(hemi, sun);
    if (xrLight.environment) scene.environment = xrLight.environment;
  });
  xrLight.addEventListener('estimationend', () => {
    scene.remove(xrLight);
    scene.environment = null;
    scene.add(hemi, sun);
  });

  const stone = new THREE.MeshStandardMaterial({
    roughness: spec.glossy ? 0.18 : 0.55,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  try {
    stone.map = await pieceTexture(THREE, renderer, spec);
    await renderer.xr.setSession(session);
  } catch (err) {
    stone.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    throw err;
  }
  const planesEnabled = Boolean(session.enabledFeatures?.includes('plane-detection'));

  // --- Detected planes --------------------------------------------------------
  type PlaneEntry = { mesh: ThreeNS.Mesh; changed: number; y: number; vertical: boolean };
  const planeMeshes = new Map<XRPlane, PlaneEntry>();
  const selectedWalls = new Set<XRPlane>();

  // --- Hit-test fallback: patches placed with a tap -------------------------
  const patches: ThreeNS.Mesh[] = [];
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.1, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
  let hitSource: XRHitTestSource | null = null;
  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitSource = (await session.requestHitTestSource?.({ space: viewerSpace })) ?? null;

  const up = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();
  const tmpN = new THREE.Vector3();
  const reticleMatrix = new THREE.Matrix4();
  let reticleKindOk = false;
  /** Latest hit result: a tap anchors the patch to it (stays put as tracking refines). */
  let lastHit: XRHitTestResult | null = null;
  const anchors = new Map<ThreeNS.Mesh, XRAnchor>();

  const patchGeometry = (w: number, h: number) =>
    planeGeometry(THREE, [{ x: -w / 2, z: -h / 2 }, { x: w / 2, z: -h / 2 }, { x: w / 2, z: h / 2 }, { x: -w / 2, z: h / 2 }], tileWm, tileHm);

  // --- Taps: wall selection (planes) or patch placement (fallback) ----------
  const controller = renderer.xr.getController(0);
  scene.add(controller);
  const raycaster = new THREE.Raycaster();
  controller.addEventListener('select', () => {
    if (kind === 'wall' && planesEnabled && planeMeshes.size) {
      const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(tmpQ.setFromRotationMatrix(controller.matrixWorld));
      raycaster.set(origin, dir);
      const walls = [...planeMeshes.entries()].filter(([, e]) => e.vertical);
      const hits = raycaster.intersectObjects(walls.map(([, e]) => e.mesh), false);
      if (hits.length) {
        const hitPlane = walls.find(([, e]) => e.mesh === hits[0].object)?.[0];
        if (hitPlane) {
          if (selectedWalls.has(hitPlane)) selectedWalls.delete(hitPlane);
          else selectedWalls.add(hitPlane);
        }
        return;
      }
    }
    if (reticle.visible && reticleKindOk && (!planesEnabled || planeMeshes.size === 0)) {
      const size = kind === 'floor' ? [10, 10] : [6, 3.2];
      const patch = new THREE.Mesh(patchGeometry(size[0], size[1]), stone);
      patch.matrixAutoUpdate = false;
      patch.matrix.copy(reticleMatrix);
      patch.userData.kind = kind;
      patches.push(patch);
      scene.add(patch);
      const hit = lastHit;
      if (hit && typeof hit.createAnchor === 'function' && session.enabledFeatures?.includes('anchors')) {
        hit.createAnchor()?.then((anchor) => {
          if (patches.includes(patch)) anchors.set(patch, anchor);
          else anchor.delete();
        }).catch(() => undefined);
      }
    }
  });

  let lastStatus: ArStatus | null = null;
  const setStatus = (s: ArStatus) => {
    if (s !== lastStatus) {
      lastStatus = s;
      callbacks.onStatus(s);
    }
  };
  const startedAt = performance.now();

  renderer.setAnimationLoop((_t, frame?: XRFrame) => {
    if (!frame) return;
    const ref = renderer.xr.getReferenceSpace();
    if (!ref) return;
    const viewer = frame.getViewerPose(ref);
    const viewerY = viewer ? viewer.transform.position.y : 0;

    // Planes -> meshes with poses.
    const detected = planesEnabled ? frame.detectedPlanes : undefined;
    if (detected) {
      for (const [plane, entry] of planeMeshes) {
        if (!detected.has(plane)) {
          scene.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          planeMeshes.delete(plane);
          selectedWalls.delete(plane);
        }
      }
      for (const plane of detected) {
        const pose = frame.getPose(plane.planeSpace, ref);
        if (!pose) continue;
        let entry = planeMeshes.get(plane);
        if (!entry) {
          const mesh = new THREE.Mesh(new THREE.BufferGeometry(), stone);
          mesh.matrixAutoUpdate = false;
          scene.add(mesh);
          entry = { mesh, changed: -1, y: 0, vertical: plane.orientation === 'vertical' };
          planeMeshes.set(plane, entry);
        }
        if (entry.changed !== plane.lastChangedTime) {
          entry.mesh.geometry.dispose();
          entry.mesh.geometry = planeGeometry(THREE, plane.polygon.map((p) => ({ x: p.x, z: p.z })), tileWm, tileHm);
          entry.changed = plane.lastChangedTime;
        }
        entry.mesh.matrix.fromArray(pose.transform.matrix);
        entry.mesh.matrixWorldNeedsUpdate = true;
        entry.y = pose.transform.position.y;
      }
      // Floor = the lowest horizontal planes below the viewer (not tables).
      let floorY = Infinity;
      for (const e of planeMeshes.values()) if (!e.vertical && e.y < viewerY - 0.4) floorY = Math.min(floorY, e.y);
      let shown = 0;
      for (const [plane, e] of planeMeshes) {
        const visible = kind === 'floor'
          ? !e.vertical && e.y < viewerY - 0.4 && e.y <= floorY + 0.12
          : e.vertical && (selectedWalls.size === 0 || selectedWalls.has(plane));
        e.mesh.visible = visible;
        if (visible) shown++;
      }
      if (shown > 0) setStatus('ready');
      else setStatus(performance.now() - startedAt > 6000 && planeMeshes.size === 0 ? 'placing' : 'scanning');
    }

    // Reticle (fallback placement, and a hint of where taps land).
    const fallback = !planesEnabled || planeMeshes.size === 0;
    reticle.visible = false;
    if (fallback && hitSource) {
      const hits = frame.getHitTestResults(hitSource);
      lastHit = hits[0] ?? null;
      const pose = hits[0]?.getPose(ref);
      if (pose) {
        reticleMatrix.fromArray(pose.transform.matrix);
        // Hit pose y-axis = surface normal: floors face up, walls sideways.
        tmpN.set(0, 1, 0).applyQuaternion(tmpQ.setFromRotationMatrix(reticleMatrix));
        const dot = tmpN.dot(up);
        reticleKindOk = kind === 'floor' ? dot > 0.85 : Math.abs(dot) < 0.35;
        reticle.matrix.copy(reticleMatrix);
        reticle.visible = true;
        (reticle.material as ThreeNS.MeshBasicMaterial).color.set(reticleKindOk ? 0xffffff : 0xff6a3d);
      }
      for (const p of patches) {
        p.visible = p.userData.kind === kind;
        const anchor = anchors.get(p);
        const apose = anchor ? frame.getPose(anchor.anchorSpace, ref) : null;
        if (apose) {
          p.matrix.fromArray(apose.transform.matrix);
          p.matrixWorldNeedsUpdate = true;
        }
      }
      if (!planesEnabled) setStatus(patches.some((p) => p.visible) ? 'ready' : 'placing');
    } else {
      for (const p of patches) p.visible = false;
    }

    renderer.render(scene, camera);
  });

  const cleanup = () => {
    renderer.setAnimationLoop(null);
    for (const e of planeMeshes.values()) e.mesh.geometry.dispose();
    for (const p of patches) p.geometry.dispose();
    for (const a of anchors.values()) a.delete();
    anchors.clear();
    stone.map?.dispose();
    stone.dispose();
    hitSource?.cancel();
    renderer.dispose();
    renderer.domElement.remove();
    callbacks.onEnd();
  };
  session.addEventListener('end', cleanup, { once: true });

  return {
    async setMaterial(next) {
      const tex = await pieceTexture(THREE, renderer, next);
      const old = stone.map;
      stone.map = tex;
      stone.roughness = next.glossy ? 0.18 : 0.55;
      stone.needsUpdate = true;
      old?.dispose();
      const sizeChanged = next.tileWcm !== spec.tileWcm || next.tileHcm !== spec.tileHcm;
      spec = next;
      if (sizeChanged) {
        tileWm = Math.max(0.05, next.tileWcm / 100);
        tileHm = Math.max(0.05, next.tileHcm / 100);
        for (const e of planeMeshes.values()) e.changed = -1; // rebuild UVs next frame
        for (const p of patches) {
          const size = p.userData.kind === 'floor' ? [10, 10] : [6, 3.2];
          p.geometry.dispose();
          p.geometry = patchGeometry(size[0], size[1]);
        }
      }
    },
    setKind(next) {
      kind = next;
    },
    clear() {
      selectedWalls.clear();
      for (const a of anchors.values()) a.delete();
      anchors.clear();
      for (const p of patches) {
        scene.remove(p);
        p.geometry.dispose();
      }
      patches.length = 0;
    },
    end() {
      session.end().catch(() => undefined);
    },
  };
}
