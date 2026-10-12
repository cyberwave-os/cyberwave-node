import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import URDFLoader from 'urdf-loader';
type URDFRobot = ReturnType<URDFLoader['parse']>;
import type { Model, SceneObject } from 'cyberwave';
export type { SceneObject } from 'cyberwave';
export type ViewerOptions = { resolveResource?: (url: string) => string; onStatus?: (status: string) => void; onSelect?: (id: string) => void; onLoad?: (result: { loaded: number; failed: number }) => void };

/** Cyberwave archives also contain legacy /../../dae references rooted in the URDF project. */
export function resolveUrdfResource(value: string, model: Model): string {
  const root = model.url.match(/^(.*\/urdf_projects\/[^/]+\/)/)?.[1] ?? new URL('.', model.url).href;
  if (value.startsWith('package://')) {
    const [pkg, ...rest] = value.slice(10).split('/');
    return new URL(rest.join('/'), (model.packageRoots?.[pkg] ?? root).replace(/\/?$/, '/')).href;
  }
  if (/^\/(?:\.\.\/)+/.test(value)) return new URL(value.replace(/^\/(?:\.\.\/)+/, ''), root).href;
  return new URL(value, model.url).href;
}

/** Z-up environment coordinates. This renderer has no API credentials or command transport. */
export function createEnvironmentViewer(container: HTMLElement, options: ViewerOptions = {}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#10161f');
  const camera = new THREE.PerspectiveCamera(42, 1, .01, 10000); camera.up.set(0, 0, 1); camera.position.set(4, -6, 3);
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.append(renderer.domElement); renderer.domElement.setAttribute('aria-label', 'Interactive Cyberwave 3D environment');
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight('#dcecff', '#526175', 2.3));
  const sun = new THREE.DirectionalLight('#ffffff', 3); sun.position.set(5, -6, 12); scene.add(sun);
  const fill = new THREE.DirectionalLight('#72bfff', 1); fill.position.set(-4, 3, 4); scene.add(fill);
  const grid = new THREE.GridHelper(40, 40, '#3a647b', '#263545'); grid.rotation.x = Math.PI / 2; grid.position.z = -.015; scene.add(grid);
  const axes = new THREE.AxesHelper(.75); scene.add(axes);
  const root = new THREE.Group(); scene.add(root);
  const nodes = new Map<string, THREE.Group>();
  let generation = 0, disposed = false, frame = 0;
  const resize = new ResizeObserver(() => { const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }); resize.observe(container);
  function animate() { if (disposed) return; controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); } animate();
  function disposeObject(object: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    object.traverse(child => { const mesh = child as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material); });
    for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); }
    geometries.forEach(x => x.dispose()); textures.forEach(x => x.dispose());
  }
  function clear() { generation++; disposeObject(root); root.clear(); nodes.clear(); }
  function fit(padding = 1.2) {
    const bounds = new THREE.Box3().setFromObject(root); if (bounds.isEmpty()) return;
    grid.position.z = Math.min(0, bounds.min.z) - .015;
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    // Fit the bounding sphere within both viewport axes, including narrow embeds.
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const distance = Math.max(size.length(), .8) / (2 * Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * Math.max(1, padding);
    controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(1, -1.6, .9).normalize().multiplyScalar(distance));
    camera.near = Math.max(.005, distance / 10000); camera.far = Math.max(1000, distance * 50); camera.updateProjectionMatrix(); controls.update();
  }
  function pose(id: string, state: Pick<SceneObject, 'position'> & Partial<Pick<SceneObject, 'rotation' | 'joints'>>) {
    const node = nodes.get(id); if (!node) return;
    node.position.set(state.position.x, state.position.y, state.position.z);
    if (state.rotation) node.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w).normalize();
    const robot = node.children[0] as URDFRobot | undefined;
    if (robot?.setJointValue && state.joints) for (const [name, value] of Object.entries(state.joints)) {
      const joint = robot.joints[name]; if (joint && ['revolute', 'continuous', 'prismatic'].includes(joint.jointType)) robot.setJointValue(name, value);
    }
  }
  async function loadModel(model: Model) {
    const manager = new THREE.LoadingManager(); manager.setURLModifier(url => options.resolveResource?.(url) ?? url);
    if (model.kind === 'glb') return (await new GLTFLoader(manager).loadAsync(model.url)).scene;
    const response = await fetch(options.resolveResource?.(model.url) ?? model.url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`URDF unavailable (${response.status})`);
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Invalid URDF XML');
    for (const element of Array.from(xml.querySelectorAll('mesh[filename], texture[filename]'))) element.setAttribute('filename', resolveUrdfResource(element.getAttribute('filename')!, model));
    const loader = new URDFLoader(manager); loader.parseCollision = false;
    const pending: Promise<unknown>[] = [], meshes = new Map<string, Promise<THREE.Object3D>>();
    loader.loadMeshCb = (url, _, done) => {
      if (!meshes.has(url)) {
        const ext = new URL(url).pathname.split('.').pop()?.toLowerCase();
        const load = ext === 'dae' ? new ColladaLoader(manager).loadAsync(url).then(x => x.scene)
          : ext === 'glb' || ext === 'gltf' ? new GLTFLoader(manager).loadAsync(url).then(x => x.scene)
          : ext === 'obj' ? new OBJLoader(manager).loadAsync(url)
          : new Promise<THREE.Object3D>((resolve, reject) => loader.defaultMeshLoader(url, manager, (object, error) => error ? reject(error) : resolve(object)));
        meshes.set(url, load);
      }
      pending.push(meshes.get(url)!.then(object => { const copy = object.clone(true); copy.traverse(child => { if (child instanceof THREE.Light || child instanceof THREE.Camera) child.visible = false; }); done(copy); }));
    };
    const robot = loader.parse(xml);
    const settled = await Promise.allSettled(pending);
    if (settled.some(x => x.status === 'rejected')) { disposeObject(robot); throw new Error('One or more URDF meshes could not be loaded'); }
    return robot;
  }
  async function setObjects(objects: SceneObject[]) {
    clear(); const current = generation; let loaded = 0, failed = 0;
    options.onStatus?.(`Loading ${objects.length} objects…`);
    // Sequential objects bound GPU/memory pressure; meshes of each robot load concurrently.
    for (const object of objects) {
      if (disposed || current !== generation) return;
      if (!object.model) { failed++; continue; }
      try {
        const model = await loadModel(object.model);
        if (disposed || current !== generation) { disposeObject(model); return; }
        const node = new THREE.Group(); node.name = object.name; node.userData.twinId = object.id;
        node.add(model); node.scale.set(object.scale.x, object.scale.y, object.scale.z); root.add(node); nodes.set(object.id, node); pose(object.id, object);
        loaded++; if (loaded === 1) fit();
        options.onStatus?.(`Loaded ${loaded} / ${objects.length} models`);
      } catch { if (current !== generation || disposed) return; failed++; }
    }
    if (disposed || current !== generation) return;
    fit(); options.onStatus?.(`${loaded} model${loaded === 1 ? '' : 's'} loaded${failed ? ` · ${failed} unavailable` : ''}`); options.onLoad?.({ loaded, failed });
  }
  const ray = new THREE.Raycaster();
  renderer.domElement.addEventListener('dblclick', event => {
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    let hit: THREE.Object3D | undefined = ray.intersectObjects(root.children, true)[0]?.object;
    while (hit && !hit.userData.twinId) hit = hit.parent ?? undefined;
    if (hit) options.onSelect?.(hit.userData.twinId);
  });
  return { setObjects, updatePose: pose, fit, clear, destroy() { disposed = true; clear(); cancelAnimationFrame(frame); resize.disconnect(); controls.dispose(); disposeObject(scene); renderer.dispose(); renderer.domElement.remove(); } };
}
