// Scene, renderer, sky, lights, post-processing and camera control. Knows nothing about the house data.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Day: sun high in the east-south-east (Depok sits near the equator); night: moonlight + the house's own lights.
const SUN_DIR = new THREE.Vector3(17.5, 30, 19).normalize();
const DAY = { fog: '#DCE4EA', hemi: ['#F5EFE4', '#AE9876', 0.5], sun: ['#FFF0D8', 2.9], exposure: 0.82, env: true };
const NIGHT = { fog: '#0D1420', hemi: ['#3A4A66', '#141414', 0.22], sun: ['#9FB4D8', 0.3], exposure: 1.0, env: false };

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(DAY.fog, 60, 150);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 0.5;
  controls.maxDistance = 90;

  // ---- sky, horizon ground and image-based light from the sky ----
  const sky = new Sky();
  sky.scale.setScalar(450);
  Object.assign(sky.material.uniforms.turbidity, { value: 5 });
  sky.material.uniforms.rayleigh.value = 1.4;
  sky.material.uniforms.mieCoefficient.value = 0.004;
  sky.material.uniforms.mieDirectionalG.value = 0.8;
  sky.material.uniforms.sunPosition.value.copy(SUN_DIR);
  scene.add(sky);

  const horizon = new THREE.Mesh(new THREE.CircleGeometry(420, 48), new THREE.MeshLambertMaterial({ color: '#7E9A60' }));
  horizon.rotation.x = -Math.PI / 2; horizon.position.y = -0.09; horizon.receiveShadow = false;
  scene.add(horizon);

  // Light from the surroundings: a soft warm-white dome over a sandy ground, not the blue sky itself,
  // because image-based light also reaches indoor surfaces and a blue sky makes the interiors look cold.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#E9EEF2') }, mid: { value: new THREE.Color('#F4EEE3') }, bottom: { value: new THREE.Color('#9A8C73') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;' +
      'void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.8, h)) : mix(mid, bottom, smoothstep(0.0, 0.25, -h));' +
      ' gl_FragColor = vec4(c, 1.0); }',
  }));
  envScene.add(dome);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFF4E0').multiplyScalar(6) }));
  sunDisc.position.copy(SUN_DIR).multiplyScalar(90); envScene.add(sunDisc);
  const envMap = pmrem.fromScene(envScene, 0.03).texture;

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(...DAY.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(...DAY.sun);
  sun.target.position.set(4.5, 0, 7);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 40);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // ---- post-processing (ambient occlusion) for the "Tinggi" quality ----
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new HouseAO(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.2, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
  ao.blendIntensity = 0.9;
  ao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-8, -1, -6), new THREE.Vector3(18, 12, 24)));
  composer.addPass(ao);
  composer.addPass(new OutputPass());

  let quality = 'high', night = false;

  function setQuality(q) {
    quality = q;
    const size = q === 'high' ? 4096 : 2048;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.5));
    resize();
  }

  function setNight(on) {
    night = on;
    const P = on ? NIGHT : DAY;
    scene.fog.color.set(P.fog);
    hemi.color.set(P.hemi[0]); hemi.groundColor.set(P.hemi[1]); hemi.intensity = P.hemi[2];
    sun.color.set(P.sun[0]); sun.intensity = P.sun[1];
    sun.castShadow = !on;
    renderer.toneMappingExposure = P.exposure;
    scene.environment = P.env ? envMap : null;
    sky.visible = !on;
    scene.background = on ? new THREE.Color(P.fog) : null;
    horizon.material.color.set(on ? '#0F1612' : '#7E9A60');
    if (model) applyNight(model);
  }

  let model = null;
  function applyNight(group) {
    group.traverse((o) => {
      if (o.userData.nightOnly) o.visible = night;
      if (o.userData.lamp) o.material.emissiveIntensity = night ? 4 : 0;
    });
  }
  function setModel(group) {
    if (model) { scene.remove(model); dispose(model); }
    model = group; scene.add(model);
    applyNight(model);
  }

  function setCamera(preset) {
    camera.position.set(...preset.pos);
    controls.target.set(...preset.target);
    // narrow (portrait) screens: pull aerial views back so the whole lot fits
    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    if (aspect < 1 && preset.pos[1] > 3) {
      const dir = camera.position.clone().sub(controls.target);
      camera.position.copy(controls.target).add(dir.multiplyScalar(Math.pow(1 / aspect, 0.75)));
    }
    camera.fov = preset.fov || (preset.pos[1] < 3 ? 62 : 40);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  const draw = () => (quality === 'high' ? composer.render() : renderer.render(scene, camera));
  const hooks = [], clock = new THREE.Clock();
  let orbit = true;
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    for (const f of hooks) f(dt);
    if (orbit) controls.update();
    draw();
  });
  function onFrame(fn) { hooks.push(fn); }
  function setOrbit(on) { orbit = on; controls.enabled = on; }

  // translucent marker over a room's floor (tap-a-room)
  let mark = null;
  function highlight(rect, z) {
    clearHighlight();
    if (!rect) return;
    const [x0, y0, x1, y1] = rect;
    mark = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0),
      new THREE.MeshBasicMaterial({ color: '#2F5D4A', transparent: true, opacity: 0.28, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2; fill.position.set((x0 + x1) / 2, z + 0.04, (y0 + y1) / 2);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0, 0.01, y1 - y0)),
      new THREE.LineBasicMaterial({ color: '#2F5D4A' }));
    edge.position.copy(fill.position);
    mark.add(fill, edge); mark.userData.noAO = true; fill.userData.noAO = true;
    scene.add(mark);
  }
  function clearHighlight() { if (mark) { scene.remove(mark); mark.traverse((o) => o.geometry && o.geometry.dispose()); mark = null; } }

  function snapshot() {
    draw();
    return new Promise((res) => renderer.domElement.toBlob(res, 'image/png'));
  }

  setNight(false);
  setQuality('high');
  return { scene, camera, controls, renderer, setModel, setCamera, snapshot, setQuality, setNight,
    onFrame, setOrbit, highlight, clearHighlight, getModel: () => model };
}

// GTAO, but glass, labels and the sky don't count as occluders.
class HouseAO extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => {
      if (o.isSprite || o.isSky || (o.material && o.material.transparent) || o.userData.noAO) o.visible = false;
    });
  }
}

// Materials and their textures are cached across rebuilds (see geometry.js), so only geometry is freed here.
function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isSprite && o.material.map) { o.material.map.dispose(); o.material.dispose(); }
  });
}
