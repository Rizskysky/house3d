// Scene, renderer, lights and camera control. Knows nothing about the house data.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#E6ECF0');
  scene.fog = new THREE.Fog('#E6ECF0', 70, 160);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 0.5;
  controls.maxDistance = 90;

  scene.add(new THREE.HemisphereLight('#EEF3F8', '#B9A98F', 1.1));
  const sun = new THREE.DirectionalLight('#FFF4E2', 2.4);
  sun.position.set(22, 30, 26);
  sun.target.position.set(4.5, 0, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  let model = null;
  function setModel(group) {
    if (model) { scene.remove(model); dispose(model); }
    model = group; scene.add(model);
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
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  function snapshot() {
    renderer.render(scene, camera);
    return new Promise((res) => renderer.domElement.toBlob(res, 'image/png'));
  }

  return { scene, camera, controls, renderer, setModel, setCamera, snapshot };
}

function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material.map) o.material.map.dispose();
  });
}
