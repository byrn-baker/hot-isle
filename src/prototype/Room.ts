import * as THREE from 'three';
import './room.css';
import { BUDGET, ROOM, buildNetwork, canRoute, dragCells, keyOf, steps } from './RouteSystem';
import { getDuctConnections } from '@/systems/AirflowSystem';
import { createServers, updateTemperatures } from '@/systems/TemperatureSystem';

type Phase = 'plan' | 'running' | 'won' | 'lost';
type Cell = [number, number];

export function startRoom(): void {
  document.body.classList.add('room-mode');
  const root = document.getElementById('game-container')!;
  root.innerHTML = `<main class="room-shell">
    <header class="room-header"><div class="room-brand"><i></i><div>HOT ISLE<small>COLD AIR. CLEAR THINKING.</small></div></div><div class="room-chapter">Cooling lab / Room 01</div><a href="?mode=classic">Classic campaign ↗</a></header>
    <div class="room-view" tabindex="0" aria-label="3D datacenter. Drag to draw ducts. Arrow keys move the cursor, Space places, Delete removes."></div>
    <nav class="room-camera" aria-label="Camera"><button id="angle" aria-pressed="true">Room view</button><button id="overhead" aria-pressed="false">Plan view</button><button id="help" aria-expanded="false">? Help</button></nav>
    <aside class="room-sidebar"><div class="room-eyebrow">Your first shift</div><h1>Keep your cool.</h1><p class="room-intro">One cooling unit. Three hot racks.<br>Build a shared duct network and bring every rack below 40°.</p>
    <div class="room-step"><span id="phase">01 / PLAN</span><strong id="connected">0 / 3 LINKED</strong></div>
    ${ROOM.servers.map((_, i) => `<div class="rack-card"><div class="rack-line"><span>RACK 0${i + 1}</span><strong id="temp-${i}">58°</strong></div><p id="rack-state-${i}">Waiting for a connection</p><div class="rack-track"><span id="bar-${i}"></span></div></div>`).join('')}
    <div class="room-budget"><span>Duct budget</span><strong id="budget">0 / ${BUDGET}</strong></div><p class="room-hint">Share a main line, then branch to each rack. Corners and junctions form automatically.</p></aside>
    <div class="room-toast" role="status" aria-live="polite"></div>
    <footer class="room-dock"><div class="room-tools"><button id="draw" aria-pressed="true">＋ Draw</button><button id="erase" aria-pressed="false">− Erase</button><button id="undo" disabled>↶ Undo</button><button id="clear" disabled>Clear</button></div><div class="room-message"><strong id="message">Start at the glowing cooler. Drag a path to a rack.</strong><span id="detail">Take your time — temperatures are paused while planning.</span><div class="room-shortcuts">RIGHT-CLICK delete · ARROWS + SPACE build · Z undo · ENTER run</div></div><button class="primary" id="run">Run cooling →</button></footer>
  </main>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const view = root.querySelector<HTMLDivElement>('.room-view')!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  view.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, .1, 100);
  let topView = false;
  const target = new THREE.Vector3(0, .1, 0);
  const setCamera = () => {
    camera.position.set(topView ? 0 : -10, topView ? 18 : 11, topView ? .01 : 13);
    camera.lookAt(target);
    el('angle').setAttribute('aria-pressed', String(!topView));
    el('overhead').setAttribute('aria-pressed', String(topView));
  };
  setCamera();
  scene.add(new THREE.HemisphereLight(0xc6e7f5, 0x263344, 2.6));
  const sun = new THREE.DirectionalLight(0xe9f3ff, 3.6);
  sun.position.set(-5, 12, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .5, far: 30 });
  sun.shadow.bias = -.001; scene.add(sun);
  const rim = new THREE.PointLight(0x48e6cc, 22, 14); rim.position.set(-3, 3, -3); scene.add(rim);
  const warm = new THREE.PointLight(0xffb270, 12, 12); warm.position.set(4, 3, 1); scene.add(warm);
  const mat = (color: number, metalness = .3, roughness = .5) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const steel = mat(0x526573, .7, .35), dark = mat(0x15202b), light = mat(0x9caeb3, .65, .3);
  const cyan = new THREE.MeshStandardMaterial({ color: 0x6cdcc4, emissive: 0x39b89b, emissiveIntensity: .7 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xe5ad68, emissive: 0xab631f, emissiveIntensity: .4 });
  function box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cylinder(parent: THREE.Object3D, x: number, y: number, z: number, r: number, height: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 24), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function label(text: string, position: THREE.Vector3) {
    const node = document.createElement('div'); node.className = 'room-label'; node.textContent = text; view.append(node);
    return { node, position };
  }
  const labels: ReturnType<typeof label>[] = [];
  const picks: THREE.Mesh[] = [];
  box(scene, 0, -.3, 0, 8.8, .5, 8.3, mat(0x1a2835));
  box(scene, 0, -.56, 0, 8.4, .12, 7.9, dark);
  // Raised-floor tiles and exposed corner fasteners.
  const floorA = mat(0x596c79, .25, .76), floorB = mat(0x526571, .25, .76);
  const screwGeo = new THREE.CylinderGeometry(.024, .024, .009, 6);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const tile = box(scene, x - 3, .005, y - 3, .98, .11, .98, (x + y) % 2 ? floorA : floorB);
    tile.userData.cell = [x, y]; picks.push(tile);
    for (const dx of [-.4, .4]) {
      const screw = new THREE.Mesh(screwGeo, steel); screw.position.set(x - 3 + dx, .067, y - 3 + .4); scene.add(screw);
    }
  }
  for (const x of [-3.85, 3.85]) {
    box(scene, x, .04, 0, .045, .03, 7.4, cyan);
    for (let z = -3.6; z < 3.7; z += .3) box(scene, x + (x > 0 ? .22 : -.22), .035, z, .16, .04, .1, amber);
  }
  // Cutaway room: the rear wall frames the miniature without hiding the work surface.
  box(scene, 0, .7, -4, 8.8, 1.5, .16, mat(0x263a49));
  for (let x = -4; x <= 4; x += 2) box(scene, x, .72, -3.88, .07, 1.45, .1, steel);
  box(scene, 0, 1.48, -3.9, 8.5, .035, .06, cyan);
  for (let x = -3; x <= 3; x += 2) {
    box(scene, x, .7, -3.88, 1.55, .6, .035, dark);
    for (let i = 0; i < 5; i++) box(scene, x, .49 + i * .1, -3.84, 1.35, .024, .04, steel);
  }
  ROOM.obstacles.forEach(({ x, y }) => {
    box(scene, x - 3, .24, y - 3, .82, .36, .82, steel);
    box(scene, x - 3, .43, y - 3, .75, .03, .75, dark);
    for (let i = 0; i < 5; i++) box(scene, x - 3 - .3 + i * .15, .451, y - 3, .065, .012, .65, amber);
  });
  const fans: THREE.Group[] = [];
  const cooler = box(scene, -3, .55, 0, .84, .98, .85, mat(0xa6bdc1, .55));
  cooler.userData.cell = [0, 3]; picks.push(cooler);
  box(scene, -2.53, .27, 0, .15, .31, .43, cyan);
  for (const z of [-.24, .24]) {
    cylinder(scene, -3, 1.06, z, .19, .04, dark);
    const fan = new THREE.Group(); fan.position.set(-3, 1.09, z); scene.add(fan); fans.push(fan);
    for (let i = 0; i < 4; i++) {
      const blade = box(fan, 0, 0, 0, .3, .015, .065, light); blade.rotation.y = i * Math.PI / 2 + .4;
    }
    cylinder(fan, 0, .015, 0, .045, .035, cyan);
  }
  labels.push(label('AHU / COLD SOURCE', new THREE.Vector3(-3, 1.45, 0)));
  const rackLights: THREE.MeshStandardMaterial[] = [];
  ROOM.servers.forEach(({ x, y }, i) => {
    const wx = x - 3, wz = y - 3;
    const rack = box(scene, wx, 1.02, wz, .85, 1.92, .86, dark);
    rack.userData.cell = [x, y]; picks.push(rack);
    box(scene, wx, 2, wz, .91, .09, .92, steel);
    box(scene, wx, .1, wz, 1, .14, .98, steel);
    box(scene, wx - .47, .24, wz, .13, .25, .44, steel);
    const status = new THREE.MeshStandardMaterial({ color: 0xe9a263, emissive: 0xe17e34, emissiveIntensity: .75 }); rackLights.push(status);
    for (let row = 0; row < 7; row++) {
      const h = .35 + row * .22;
      box(scene, wx, h, wz + .44, .69, .17, .055, steel);
      for (let slot = 0; slot < 5; slot++) box(scene, wx - .21 + slot * .075, h, wz + .474, .025, .065, .012, dark);
      box(scene, wx + .24, h, wz + .48, .04, .035, .012, status);
      // Side vents visible from the default camera.
      box(scene, wx - .44, h, wz, .015, .035, .62, steel);
    }
    box(scene, wx - .453, 1.1, wz + .29, .018, 1.5, .025, status);
    labels.push(label(`RACK 0${i + 1}`, new THREE.Vector3(wx, 2.35, wz)));
  });
  let cells = new Set<string>();
  let network = buildNetwork(cells);
  const ducts = new THREE.Group(); scene.add(ducts);
  const ductMaterial = mat(0xadc0c5, .75, .28);
  const channel = mat(0x1d424b, .6, .35);
  const liveChannel = new THREE.MeshStandardMaterial({ color: 0x7de5d0, emissive: 0x4ad6bb, emissiveIntensity: .6 });
  const cursorMaterial = new THREE.MeshBasicMaterial({ color: 0xa0f8d7, transparent: true, opacity: .35, depthWrite: false });
  const cursorMesh = new THREE.Mesh(new THREE.BoxGeometry(.94, .04, .94), cursorMaterial); scene.add(cursorMesh);
  let cursor: Cell = [1, 3]; let phase: Phase = 'plan'; let erase = false; let elapsed = 0;
  let servers = newServers();
  function newServers() { return createServers(ROOM.servers.map((s, i) => ({ ...s, id: `rack-${i}` }))); }
  const history: string[][] = [];
  let dragging = false, lastCell: Cell | null = null, gestureBefore: string[] | null = null;
  let help = false;
  const toast = root.querySelector<HTMLDivElement>('.room-toast')!;
  let toastUntil = 0;
  function notify(message: string) { toast.textContent = message; toastUntil = performance.now() + 4000; }
  function clearDucts() {
    ducts.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    ducts.clear();
  }
  function rebuild() {
    network = buildNetwork(cells); clearDucts();
    for (const [key, duct] of network.grid.ducts) {
      const firstMesh = ducts.children.length;
      const x = duct.position.x - 3, z = duct.position.y - 3;
      const connected = network.airflow.airflowPaths.has(key);
      box(ducts, x, .21, z, .3, .23, .3, ductMaterial);
      for (const dir of getDuctConnections(duct.type, duct.rotation)) {
        const [, dx, dz] = steps.find(([d]) => d === dir)!;
        box(ducts, x + dx * .25, .21, z + dz * .25, dx ? .5 : .3, .23, dz ? .5 : .3, ductMaterial);
        box(ducts, x + dx * .25, .333, z + dz * .25, dx ? .5 : .11, .012, dz ? .5 : .11, connected ? liveChannel : channel);
        box(ducts, x + dx * .44, .21, z + dz * .44, dx ? .045 : .35, .28, dz ? .045 : .35, steel);
      }
      for (const mesh of ducts.children.slice(firstMesh)) {
        mesh.userData.cell = [duct.position.x, duct.position.y];
      }
    }
    updateHud();
  }
  function updateHud() {
    el('budget').textContent = `${cells.size} / ${BUDGET}`;
    el('connected').textContent = `${network.airflow.cooledServers.size} / 3 LINKED`;
    el('phase').textContent = phase === 'plan' ? '01 / PLAN' : phase === 'running' ? `02 / TEST · ${elapsed.toFixed(1)}s` : phase === 'won' ? '03 / ALL SYSTEMS COOL' : '03 / TEST FAILED';
    el<HTMLButtonElement>('run').textContent = phase === 'plan' ? 'Run cooling →' : phase === 'running' ? 'Stop & edit' : 'Back to planning';
    for (const id of ['draw', 'erase', 'clear', 'undo']) el<HTMLButtonElement>(id).disabled = phase !== 'plan' || (id === 'undo' && history.length === 0) || (id === 'clear' && cells.size === 0);
    servers.forEach((server, i) => {
      const connected = network.airflow.cooledServers.has(server.id);
      const safe = server.temperature <= server.safeThreshold;
      const color = server.isMeltedDown ? '#ff766c' : safe ? '#91edcb' : '#edb77d';
      el(`temp-${i}`).textContent = `${Math.round(server.temperature)}°`;
      el(`temp-${i}`).style.color = color;
      el(`bar-${i}`).style.width = `${server.temperature}%`;
      el(`bar-${i}`).style.background = color;
      el(`rack-state-${i}`).textContent = server.isMeltedDown ? 'Overheated · revise the route' : phase === 'plan' ? connected ? 'Connected · ready to cool' : 'Waiting for a connection' : safe ? 'Safe temperature reached' : connected ? 'Cooling ↓' : 'No airflow · heating ↑';
      rackLights[i]!.color.set(color); rackLights[i]!.emissive.set(color);
    });
    view.setAttribute('aria-label', `3D datacenter. Cursor column ${cursor[0] + 1}, row ${cursor[1] + 1}. ${cells.size} of ${BUDGET} ducts used. ${network.airflow.cooledServers.size} racks connected.`);
  }
  function snapshot() { history.push([...cells]); if (history.length > 50) history.shift(); }
  function editCell(cell: Cell): boolean {
    if (phase !== 'plan' || !canRoute(...cell)) return false;
    const key = keyOf(...cell);
    if (erase) return cells.delete(key);
    if (cells.has(key)) return false;
    if (cells.size >= BUDGET) { notify('Duct budget reached. Share a route or erase a section.'); return false; }
    cells.add(key); return true;
  }
  function finishGesture() {
    if (gestureBefore && gestureBefore.join('|') !== [...cells].join('|')) {
      history.push(gestureBefore); if (history.length > 50) history.shift();
    }
    gestureBefore = null; dragging = false; lastCell = null; updateHud();
  }
  const ray = new THREE.Raycaster();
  function hit(event: PointerEvent): Cell | null {
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const intersection = ray.intersectObjects([...picks, ...ducts.children], false)[0];
    return intersection?.object.userData.cell as Cell | undefined ?? null;
  }
  renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
  renderer.domElement.addEventListener('pointerdown', event => {
    if (phase !== 'plan' || (event.button !== 0 && event.button !== 2)) return;
    view.focus(); const cell = hit(event); if (!cell) return;
    if (event.button === 2) {
      event.preventDefault();
      finishGesture();
      cursor = cell;
      if (cells.has(keyOf(...cell))) {
        snapshot();
        cells.delete(keyOf(...cell));
        rebuild();
      }
      return;
    }
    dragging = true; lastCell = cell; cursor = cell; gestureBefore = [...cells];
    renderer.domElement.setPointerCapture(event.pointerId);
    if (editCell(cell)) rebuild();
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (phase !== 'plan') return;
    const cell = hit(event); if (!cell) return; cursor = cell;
    if (dragging && lastCell) {
      let changed = false;
      for (const next of dragCells(lastCell, cell)) { changed = editCell(next) || changed; lastCell = next; }
      if (changed) rebuild();
    }
  });
  renderer.domElement.addEventListener('pointerup', finishGesture);
  renderer.domElement.addEventListener('pointercancel', finishGesture);
  renderer.domElement.addEventListener('lostpointercapture', () => { if (dragging) finishGesture(); });
  function undo() { if (phase !== 'plan' || !history.length) return; cells = new Set(history.pop()!); rebuild(); }
  function chooseTool(value: boolean) { if (phase !== 'plan') return; erase = value; el('draw').setAttribute('aria-pressed', String(!erase)); el('erase').setAttribute('aria-pressed', String(erase)); }
  function run() {
    finishGesture();
    if (phase === 'plan') {
      if (!cells.size) { notify('Draw a duct from the cooler before testing.'); return; }
      servers = newServers(); elapsed = 0; phase = 'running';
      el('message').textContent = 'Cooling test in progress.';
      el('detail').textContent = 'Watch the rack temperatures. Stop anytime to revise your design.';
    } else {
      phase = 'plan'; servers = newServers(); elapsed = 0;
      el('message').textContent = 'Revise your route. Your layout is preserved.';
      el('detail').textContent = 'Temperatures reset for a fair test. Connect all three racks, then run again.';
    }
    updateHud();
  }
  el('run').onclick = run; el('undo').onclick = undo;
  el('draw').onclick = () => chooseTool(false); el('erase').onclick = () => chooseTool(true);
  el('clear').onclick = () => { if (phase !== 'plan' || !cells.size) return; snapshot(); cells.clear(); rebuild(); };
  el('angle').onclick = () => { topView = false; setCamera(); };
  el('overhead').onclick = () => { topView = true; setCamera(); };
  el('help').onclick = () => {
    help = !help; el('help').setAttribute('aria-expanded', String(help));
    el('message').textContent = help ? 'Drag from the cooler to a rack; branch from any existing duct.' : 'Plan freely. Test your design when you’re ready.';
    el('detail').textContent = help ? 'Right-click deletes a duct. Arrows move; Space places; Delete erases; Z undoes; Enter runs/stops. Plan view helps reach hidden tiles.' : 'The cyan line previews connected ducts. Right-click to delete, or use Erase and Undo.';
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
    const moves: Record<string, Cell> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (event.key === 'Enter') { event.preventDefault(); if (!event.repeat) run(); return; }
    if (phase !== 'plan') return;
    if (moves[event.key]) {
      event.preventDefault(); const [dx, dy] = moves[event.key]!;
      cursor = [THREE.MathUtils.clamp(cursor[0] + dx, 0, 6), THREE.MathUtils.clamp(cursor[1] + dy, 0, 6)]; updateHud();
    } else if ([' ', 'Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault(); const before = [...cells]; const previous = erase;
      if (event.key !== ' ') erase = true;
      if (editCell(cursor)) { history.push(before); rebuild(); }
      erase = previous;
    } else if (event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
  };
  window.addEventListener('keydown', onKey);
  const resize = () => {
    const { width, height } = view.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height, span = Math.max(10.7, 13 / aspect);
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
    camera.top = span / 2; camera.bottom = -span / 2; camera.updateProjectionMatrix();
    renderer.setSize(width, height); setCamera();
  };
  const observer = new ResizeObserver(resize); observer.observe(view); resize();
  // Reuse a small particle pool, never allocate a new mesh in the animation loop.
  const dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xb0ffe9, size: .07, transparent: true, opacity: .9 }));
  const positions = new Float32Array(BUDGET * 3 * 3);
  dots.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); scene.add(dots);
  let lastTime = 0, hudTime = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setAnimationLoop(time => {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .05) : 0; lastTime = time;
    if (phase === 'running' && !document.hidden) {
      elapsed += dt; const state = updateTemperatures(servers, dt, network.airflow.cooledServers);
      if (state.hasMeltdown || state.allCooled) {
        phase = state.hasMeltdown ? 'lost' : 'won';
        el('message').textContent = phase === 'won' ? 'All systems cool. Nice engineering.' : 'A rack overheated. Let’s revise the network.';
        el('detail').textContent = phase === 'won' ? `${cells.size} duct sections · ${elapsed.toFixed(1)}s to safe temperatures. Can you do it with fewer ducts?` : 'Return to planning and check the unconnected rack. Your ducts are saved.';
        updateHud();
      }
    }
    hudTime += dt; if (hudTime > .1) { updateHud(); hudTime = 0; }
    if (!reducedMotion) for (const fan of fans) fan.rotation.y += dt * (phase === 'running' ? 12 : 2);
    cursorMesh.visible = phase === 'plan'; cursorMesh.position.set(cursor[0] - 3, .09, cursor[1] - 3);
    cursorMaterial.color.set(erase || !canRoute(...cursor) ? 0xf6aa80 : 0xa0f8d7);
    let count = 0;
    if (phase === 'running' && !reducedMotion) {
      for (const key of network.airflow.airflowPaths) {
        const duct = network.grid.ducts.get(key)!;
        const ports = getDuctConnections(duct.type, duct.rotation);
        for (let i = 0; i < 3; i++) {
          const dir = ports[i % ports.length]!; const [, dx, dz] = steps.find(([d]) => d === dir)!;
          const t = ((time / 850 + i / 3) % 1 - .5);
          positions[count * 3] = duct.position.x - 3 + dx * t;
          positions[count * 3 + 1] = .37;
          positions[count * 3 + 2] = duct.position.y - 3 + dz * t;
          count++;
        }
      }
    }
    dots.geometry.setDrawRange(0, count); dots.geometry.attributes.position!.needsUpdate = true;
    for (const { node, position } of labels) {
      const p = position.clone().project(camera);
      node.style.left = `${(p.x + 1) / 2 * view.clientWidth}px`;
      node.style.top = `${(1 - p.y) / 2 * view.clientHeight}px`;
    }
    if (toastUntil && performance.now() > toastUntil) { toast.textContent = ''; toastUntil = 0; }
    renderer.render(scene, camera);
  });
  rebuild();
  const dispose = () => {
    renderer.setAnimationLoop(null); observer.disconnect(); window.removeEventListener('keydown', onKey);
    const materials = new Set<THREE.Material>();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    for (const material of materials) material.dispose();
    renderer.dispose();
  };
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
}
