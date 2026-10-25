/* Hero scene: floating travertine pavers assemble into a diamond-pattern patio with turf joints,
   then a fire table rises at the center. Progress comes from the pinned hero (main.js). */
import * as THREE from '../vendor/three.module.min.js';

const canvas = document.getElementById('heroCanvas');
const stage = document.getElementById('heroStage');
const DDD = window.DDD || { heroProgress: 0 };
const mobile = matchMedia('(max-width: 899px)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
}

if (renderer) init();

function init() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);

  /* light: low desert sun + warm sky bounce */
  scene.add(new THREE.HemisphereLight('#f7e6cf', '#3b2a1d', 1.1));
  const sun = new THREE.DirectionalLight('#ffd3a1', 2.6);
  sun.position.set(-9, 12, 7);
  sun.castShadow = !mobile;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 40 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  /* patio, rotated 45° for the diamond pattern */
  const patio = new THREE.Group();
  patio.rotation.y = Math.PI / 4;
  scene.add(patio);

  const N = mobile ? 9 : 13;
  const SIZE = 1;
  const GAP = 0.2;
  const PITCH = SIZE + GAP;
  const half = ((N - 1) * PITCH) / 2;
  const COUNT = N * N;

  const slabGeo = new THREE.BoxGeometry(SIZE, 0.12, SIZE);
  const slabMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  const slabs = new THREE.InstancedMesh(slabGeo, slabMat, COUNT);
  slabs.castShadow = slabs.receiveShadow = !mobile;
  slabs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  patio.add(slabs);

  const tones = ['#ebe2d3', '#e0d5c3', '#f1e9dc', '#d6c9b3', '#e6dccb'].map(c => new THREE.Color(c));
  const rand = mulberry32(368643);
  const data = [];
  for (let gx = 0; gx < N; gx++) {
    for (let gz = 0; gz < N; gz++) {
      const i = gx * N + gz;
      const tx = gx * PITCH - half, tz = gz * PITCH - half;
      const dist = Math.hypot(tx, tz) / (half * Math.SQRT2);
      const a = rand() * Math.PI * 2;
      const r = 4 + rand() * 9;
      data.push({
        target: new THREE.Vector3(tx, 0.06, tz),
        start: new THREE.Vector3(Math.cos(a) * r, 2.5 + rand() * 7, Math.sin(a) * r),
        startQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28)),
        delay: dist * 0.6 + rand() * 0.4,
        phase: rand() * Math.PI * 2,
        spin: 0.2 + rand() * 0.5
      });
      slabs.setColorAt(i, tones[Math.floor(rand() * tones.length)]);
    }
  }
  slabs.instanceColor.needsUpdate = true;

  /* turf grows in underneath so the joints read green */
  const turfSize = N * PITCH + 0.4;
  const turfMat = new THREE.MeshStandardMaterial({ color: '#4c7a33', roughness: 1, transparent: true, opacity: 0 });
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(turfSize, turfSize), turfMat);
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = !mobile;
  patio.add(turf);

  /* gravel border */
  const borderMat = new THREE.MeshStandardMaterial({ color: '#8a6f55', roughness: 1, transparent: true, opacity: 0 });
  const border = new THREE.Mesh(new THREE.RingGeometry(turfSize * 0.71, turfSize * 0.71 + 1.6, 4, 1), borderMat);
  border.rotation.x = -Math.PI / 2;
  border.rotation.z = Math.PI / 4;
  border.position.y = -0.01;
  patio.add(border);

  /* fire table rises at the end */
  const fire = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 1.1), new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.6 }));
  body.castShadow = !mobile;
  const flameMat = new THREE.MeshStandardMaterial({ color: '#ff8a3d', emissive: '#ff7a2a', emissiveIntensity: 0 });
  const flame = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 0.24), flameMat);
  flame.position.y = 0.3;
  const glow = new THREE.PointLight('#ff9a4a', 0, 9, 1.6);
  glow.position.y = 0.9;
  // soft additive halo so the flame reads as light, not a strip
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,170,90,1)');
    grd.addColorStop(0.35, 'rgba(255,120,40,.45)');
    grd.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(5.5, 2.6, 1);
  halo.position.y = 0.55;
  fire.add(body, flame, glow, halo);
  fire.scale.setScalar(1.35);
  scene.add(fire);

  /* camera path */
  const camFrom = new THREE.Vector3(0, 5.2, 18);
  const camTo = new THREE.Vector3(0, 15.5, 17.5);
  const lookFrom = new THREE.Vector3(0, 3, 0);
  const lookTo = new THREE.Vector3(0, -0.6, 0);
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let distK = 1;

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    distK = camera.aspect < 1 ? 1.75 : camera.aspect < 1.4 ? 1.25 : 1;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  if (!mobile) {
    addEventListener('pointermove', e => {
      pointer.tx = e.clientX / innerWidth - 0.5;
      pointer.ty = e.clientY / innerHeight - 0.5;
    }, { passive: true });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const spinQ = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const smooth = t => t * t * (3 - 2 * t);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  let p = DDD.heroProgress;

  function frame(time) {
    const t = time / 1000;
    // ease toward scroll progress so the assembly feels weighty
    p += (DDD.heroProgress - p) * 0.09;
    const idle = 1 - clamp01(p * 3);

    for (let i = 0; i < COUNT; i++) {
      const d = data[i];
      const k = easeOut(clamp01((p - d.delay * 0.45) / 0.4));
      pos.lerpVectors(d.start, d.target, k);
      pos.y += Math.sin(k * Math.PI) * 1.4 + Math.sin(t * 0.8 + d.phase) * 0.25 * (1 - k);
      spinQ.setFromAxisAngle(yAxis, t * d.spin * (1 - k));
      q.copy(d.startQ).multiply(spinQ).slerp(identity, k);
      m.compose(pos, q, one);
      slabs.setMatrixAt(i, m);
    }
    slabs.instanceMatrix.needsUpdate = true;

    const ground = smooth(clamp01((p - 0.45) / 0.4));
    turfMat.opacity = ground;
    borderMat.opacity = ground * 0.9;

    const f = smooth(clamp01((p - 0.78) / 0.2));
    fire.position.y = -1.1 + f * 1.48;
    fire.visible = f > 0.001;
    flameMat.emissiveIntensity = f * (3.2 + Math.sin(t * 9) * 0.35 + Math.sin(t * 13.7) * 0.2);
    glow.intensity = f * (18 + Math.sin(t * 11) * 2.5);
    haloMat.opacity = f * (0.85 + Math.sin(t * 7.3) * 0.08);

    const c = smooth(clamp01(p * 1.1));
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    camPos.lerpVectors(camFrom, camTo, c).multiplyScalar(distK);
    camPos.x += pointer.x * 1.6 + Math.sin(t * 0.15) * 0.4 * idle;
    camPos.y += -pointer.y * 0.9;
    look.lerpVectors(lookFrom, lookTo, c);
    camera.position.copy(camPos);
    camera.lookAt(look);
    // keep the floating cloud clear of the headline, then recenter as the patio lands
    const w = stage.clientWidth, h = stage.clientHeight, off = 1 - c;
    camera.setViewOffset(w, h, mobile ? 0 : -w * 0.2 * off, mobile ? h * 0.2 * off : 0, w, h);

    renderer.render(scene, camera);
  }

  if (DDD.reduced) {
    p = 1;
    frame(0);
    return;
  }

  // render only while the hero is on screen and the tab is visible
  let visible = true;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    renderer.setAnimationLoop(visible ? frame : null);
  }).observe(stage);
  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden || !visible ? null : frame));
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
