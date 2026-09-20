import { createFlowArrow, COOL_AIR_COLOR, HOT_AIR_COLOR } from './FlowArrow';
import * as THREE from 'three';
import { getRotatedFootprintSize } from '../model/placement';
import type { EquipmentDefinition, EquipmentInstance, GridPosition, Orientation, ScenarioDefinition, ScenarioState } from '../model/types';

export type RoomOverlay = 'none' | 'temperature' | 'airflow';
export interface RoomRenderOptions {
  selectedId?: string | null;
  cursor?: GridPosition | null;
  preview?: { definitionId: string; orientation: Orientation; valid: boolean } | null;
  overlay?: RoomOverlay;
  showLabels?: boolean;
}
const angles: Record<Orientation, number> = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 };
const cold = new THREE.Color(COOL_AIR_COLOR);
const hot = new THREE.Color(HOT_AIR_COLOR);

/** Presentation only: world x/z map directly onto model x/y floor coordinates. */
export class RoomRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private readonly equipment = new Map<string, { group: THREE.Group; signature: string; label: HTMLButtonElement }>();
  private readonly heatTiles: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly arrows: ReturnType<typeof createFlowArrow>[] = [];
  private readonly labels = document.createElement('div');
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly cursor = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.035, 0.96), new THREE.MeshBasicMaterial({ color: '#67e8cd', transparent: true, opacity: 0.4 }));
  private preview: THREE.Group | null = null;
  private previewKey = '';
  private shadowSignature = '';
  private planView = false;
  private zoom = 1;
  private azimuth = 0;
  private orbitPointer: { id: number; x: number } | null = null;
  private readonly cutaway = new THREE.Group();
  private readonly occluders: THREE.Object3D[] = [];
  private onOrbitDown = (event: PointerEvent) => {
    if (event.button !== 1) return;
    event.preventDefault(); this.canvas.focus();
    this.orbitPointer = { id: event.pointerId, x: event.clientX };
    this.canvas.setPointerCapture(event.pointerId);
  };
  private onOrbitMove = (event: PointerEvent) => {
    if (this.orbitPointer?.id !== event.pointerId) return;
    this.rotateView((event.clientX - this.orbitPointer.x) * -0.008);
    this.orbitPointer.x = event.clientX;
  };
  private onOrbitEnd = (event: PointerEvent) => {
    if (this.orbitPointer?.id !== event.pointerId) return;
    this.orbitPointer = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };
  private readonly observer: ResizeObserver;
  private readonly center: THREE.Vector3;
  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(event.deltaY * 0.0007), 0.65, 1.5);
    this.positionCamera();
  };

  constructor(private readonly host: HTMLElement, private readonly definition: ScenarioDefinition) {
    const room = definition.room;
    this.center = new THREE.Vector3((room.widthCells - 1) / 2, 0, (room.heightCells - 1) / 2);
    this.scene.fog = new THREE.FogExp2('#102334', 0.025);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    // Room lights and equipment are static between planning edits.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'tycoon-canvas';
    this.canvas.setAttribute('aria-label', 'Datacenter floor. Use the room keyboard controls to place and inspect equipment.');
    this.canvas.tabIndex = 0;
    this.labels.className = 'tycoon-world-labels';
    Object.assign(this.labels.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
    this.host.append(this.canvas, this.labels);
    this.scene.add(new THREE.HemisphereLight('#cbeeff', '#263248', 2.4));
    const key = new THREE.DirectionalLight('#fff1d8', 3.2);
    key.position.set(-5, 17, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, far: 50 });
    key.shadow.normalBias = 0.04;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#57bbff', 1.1);
    fill.position.set(12, 7, -6);
    this.scene.add(fill);
    const foundation = this.box(room.widthCells + 0.5, 0.3, room.heightCells + 0.5, '#16283e');
    foundation.position.copy(this.center).y = -0.22;
    foundation.receiveShadow = true;
    this.scene.add(foundation);
    const tileGeometry = new THREE.BoxGeometry(0.965, 0.05, 0.965);
    const tileMaterials = ['#516477', '#53687b'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.83 }));
    const heatGeometry = new THREE.PlaneGeometry(0.94, 0.94);
    for (let y = 0; y < room.heightCells; y++) for (let x = 0; x < room.widthCells; x++) {
      const tile = new THREE.Mesh(tileGeometry, tileMaterials[(x + y) % 2]);
      tile.position.set(x, -0.03, y); tile.receiveShadow = true; this.scene.add(tile);
      const heat = new THREE.Mesh(heatGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false }));
      heat.rotation.x = -Math.PI / 2; heat.position.set(x, 0.013, y); heat.visible = false;
      this.heatTiles.push(heat); this.scene.add(heat);
      const arrow = createFlowArrow(COOL_AIR_COLOR);
      arrow.group.position.set(x, 0.10, y);
      arrow.group.visible = false; this.arrows.push(arrow); this.scene.add(arrow.group);
    }
    for (const cell of room.blockedCells) {
      const obstacle = this.box(0.96, 1.7, 0.96, '#46566b'); obstacle.position.set(cell.x, 0.85, cell.y); this.scene.add(obstacle); this.occluders.push(obstacle);
    }
    for (const cell of room.requiredAccessCells) {
      const stripe = this.box(0.66, 0.014, 0.12, '#ebbb68'); stripe.position.set(cell.x, 0.025, cell.y); this.scene.add(stripe);
    }
    // Rear cutaway wall gives the room depth without concealing the player's floor.
    const wall = this.box(room.widthCells + 0.4, 1.45, 0.12, '#263b51');
    wall.position.set(this.center.x, 0.58, -0.67); this.cutaway.add(wall); this.occluders.push(wall);
    const rail = this.box(room.widthCells + 0.1, 0.045, 0.045, '#70d0dc');
    rail.position.set(this.center.x, 1.32, -0.59); this.cutaway.add(rail); this.scene.add(this.cutaway);
    this.cursor.visible = false; this.scene.add(this.cursor);
    this.positionCamera();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.onOrbitDown);
    this.canvas.addEventListener('pointermove', this.onOrbitMove);
    this.canvas.addEventListener('pointerup', this.onOrbitEnd);
    this.canvas.addEventListener('pointercancel', this.onOrbitEnd);
    this.resize();
  }

  private box(width: number, height: number, depth: number, color: THREE.ColorRepresentation, metalness = 0.1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: 0.63, metalness }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  private buildEquipment(definition: EquipmentDefinition) {
    const group = new THREE.Group();
    const rack = definition.kind === 'rack';
    const height = rack ? 1.65 : 1.25;
    const width = definition.footprint.widthCells * 0.82;
    const depth = definition.footprint.depthCells * 0.82;
    const body = this.box(width, height, depth, rack ? '#182533' : '#b4c7cf', rack ? 0.35 : 0.15);
    body.position.y = height / 2; group.add(body);
    const top = this.box(width + 0.035, 0.06, depth + 0.025, rack ? '#50627a' : '#dce8e8');
    top.position.y = height + 0.02; group.add(top);
    const face = this.box(width * 0.88, height * 0.84, 0.025, rack ? '#080f1c' : '#364e60');
    face.position.set(0, height * 0.52, -depth / 2 - 0.015); group.add(face);
    const count = rack ? 9 : 5;
    for (let i = 0; i < count; i++) {
      const blade = this.box(width * 0.73, rack ? 0.085 : 0.07, 0.035, rack ? '#45536a' : '#859ca9');
      blade.position.set(0, 0.2 + i * (rack ? 0.148 : 0.19), -depth / 2 - 0.035); group.add(blade);
      if (rack) {
        const led = this.box(0.038, 0.033, 0.01, i % 3 ? '#75f5ce' : '#61bdff');
        led.position.set(width * 0.29, blade.position.y, -depth / 2 - 0.06); group.add(led);
      }
    }
    const rear = this.box(width * 0.7, height * 0.8, 0.025, '#312b30');
    rear.position.set(0, height * 0.52, depth / 2 + 0.015); group.add(rear);
    for (const z of [-1, 1]) {
      const mark = this.box(rack ? width * 0.78 : 0.025, 0.12, rack ? 0.025 : depth * 0.78, z < 0 ? COOL_AIR_COLOR : HOT_AIR_COLOR);
      (mark.material as THREE.MeshStandardMaterial).emissive.set(z < 0 ? COOL_AIR_COLOR : HOT_AIR_COLOR);
      (mark.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7;
      mark.position.set(rack ? 0 : z * (width / 2 + 0.035), height * 0.94, rack ? z * (depth / 2 + 0.035) : 0); group.add(mark);
    }
    // Rack: blue into the front, red out of the rear.
    // Cooler: red into the return, blue out of the supply (local -X).
    for (const side of [-1, 1]) {
      const arrow = createFlowArrow(side < 0 ? COOL_AIR_COLOR : HOT_AIR_COLOR, 0.48, 0.30);
      arrow.group.position.set(rack ? 0 : side * width * 0.28, height + 0.065, rack ? side * depth * 0.28 : 0);
      arrow.group.rotation.y = rack ? 0 : -Math.PI / 2;
      arrow.group.name = side < 0 ? (rack ? 'cold-intake' : 'cold-supply') : (rack ? 'hot-exhaust' : 'hot-return');
      group.add(arrow.group);
    }
    if (rack) {
      // Raised rear chevrons remain legible without relying on the hot-side color.
      for (const x of [-0.13, 0.13]) {
        const left = this.box(0.22, 0.035, 0.025, '#fff0db');
        left.rotation.z = Math.PI / 4;
        left.position.set(x - 0.07, height * 0.66, depth / 2 + 0.06);
        const right = this.box(0.22, 0.035, 0.025, '#fff0db');
        right.rotation.z = -Math.PI / 4;
        right.position.set(x + 0.07, height * 0.66, depth / 2 + 0.06);
        group.add(left, right);
      }
    }
    return group;
  }

  private positionCamera() {
    const extent = Math.max(this.definition.room.widthCells, this.definition.room.heightCells) * Math.max(1, 1.35 / this.camera.aspect);
    const axis = new THREE.Vector3(0, 1, 0);
    this.camera.up.copy(this.planView ? new THREE.Vector3(0, 0, -1).applyAxisAngle(axis, this.azimuth) : axis);
    if (this.planView) this.camera.position.set(this.center.x, extent * 1.6 * this.zoom, this.center.z);
    else this.camera.position.copy(this.center).add(new THREE.Vector3(extent * 0.85, extent, extent * 1.12).multiplyScalar(this.zoom).applyAxisAngle(axis, this.azimuth));
    this.camera.lookAt(this.center);
    this.cutaway.visible = this.planView || this.camera.position.z >= this.center.z;
    this.camera.updateMatrixWorld();
  }

  zoomView(factor: number) { this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 0.65, 1.5); this.positionCamera(); }

  rotateView(radians: number) { this.azimuth = (this.azimuth + radians) % (Math.PI * 2); this.positionCamera(); }

  setPlanView(enabled: boolean) { this.planView = enabled; this.positionCamera(); }
  resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.positionCamera();
  }

  pick(clientX: number, clientY: number, floorOnly = false): { position: GridPosition; instanceId: string | null } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    // ArrowHelper lines have a broad raycast tolerance; only solid surfaces select racks.
    const solids: THREE.Object3D[] = [];
    if (!floorOnly) {
      for (const { group } of this.equipment.values()) group.traverse(object => {
        if (object instanceof THREE.Mesh && !object.userData.presentationOnly && !(object.parent instanceof THREE.ArrowHelper)) solids.push(object);
      });
      solids.push(...this.occluders.filter(object => object.visible && object.parent?.visible));
      const hit = this.raycaster.intersectObjects(solids, false)[0];
      if (hit) {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.instanceId) object = object.parent;
        return object ? { position: { ...object.userData.position }, instanceId: object.userData.instanceId as string } : null;
      }
    }
    const point = this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3());
    if (!point) return null;
    const x = Math.round(point.x), y = Math.round(point.z);
    if (x < 0 || y < 0 || x >= this.definition.room.widthCells || y >= this.definition.room.heightCells) return null;
    return { position: { x, y }, instanceId: null };
  }

  render(state: Readonly<Pick<ScenarioState, 'air' | 'equipment'>>, options: RoomRenderOptions = {}) {
    const present = new Set(state.equipment.map(item => item.id));
    for (const [id, entry] of this.equipment) if (!present.has(id)) {
      this.scene.remove(entry.group); this.disposeObject(entry.group); entry.label.remove(); this.equipment.delete(id);
    }
    for (const item of state.equipment) this.updateEquipment(item, options.selectedId === item.id);
    const overlay = options.overlay ?? 'none';
    for (let i = 0; i < this.heatTiles.length; i++) {
      const value = state.air.temperatureC[i];
      const tile = this.heatTiles[i]!;
      tile.visible = overlay === 'temperature' && state.air.freeCellMask[i] === true && value != null;
      if (tile.visible) tile.material.color.copy(cold).lerp(hot, THREE.MathUtils.clamp(((value ?? 21) - 18) / 22, 0, 1));
      const arrow = this.arrows[i]!;
      const width = this.definition.room.widthCells, height = this.definition.room.heightCells;
      const x = i % width, y = Math.floor(i / width);
      // X faces use a (width - 1) row stride; Y faces use width.
      const west = x > 0 ? state.air.faceFlowXM3s[y * (width - 1) + x - 1] ?? 0 : 0;
      const east = x + 1 < width ? state.air.faceFlowXM3s[y * (width - 1) + x] ?? 0 : 0;
      const north = y > 0 ? state.air.faceFlowYM3s[(y - 1) * width + x] ?? 0 : 0;
      const south = y + 1 < height ? state.air.faceFlowYM3s[y * width + x] ?? 0 : 0;
      const vx = (west + east) / 2, vy = (north + south) / 2;
      const flow = Math.hypot(vx, vy);
      arrow.group.visible = overlay === 'airflow' && state.air.flowValid && state.air.freeCellMask[i] === true && flow > 0.005;
      if (arrow.group.visible) {
        arrow.group.rotation.y = Math.atan2(vx, vy);
        arrow.group.scale.setScalar(Math.min(1.1, 0.85 + flow * 0.08));
        arrow.fill.material.color.copy(cold).lerp(hot, THREE.MathUtils.clamp(((value ?? 21) - 18) / 17, 0, 1));
      }
    }
    this.cursor.visible = Boolean(options.cursor);
    if (options.cursor) {
      this.cursor.position.set(options.cursor.x, 0.035, options.cursor.y);
      this.cursor.material.color.set(options.preview?.valid === false ? '#ff826a' : '#75f5ce');
    }
    const previewKey = options.preview?.definitionId ?? '';
    if (previewKey !== this.previewKey) {
      if (this.preview) { this.scene.remove(this.preview); this.disposeObject(this.preview); }
      this.preview = null; this.previewKey = previewKey;
      const definition = this.definition.equipment.find(item => item.id === previewKey);
      if (definition) {
        this.preview = this.buildEquipment(definition);
        this.preview.traverse(object => { if (object instanceof THREE.Mesh) { const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { material.transparent = true; material.opacity = 0.34; material.depthWrite = false; if ('color' in material && material.color instanceof THREE.Color) material.userData.previewColor = `#${material.color.getHexString()}`; } } });
        this.scene.add(this.preview);
      }
    }
    if (this.preview) {
      this.preview.visible = Boolean(options.cursor && options.preview);
      if (options.cursor && options.preview) {
        const definition = this.definition.equipment.find(item => item.id === options.preview!.definitionId)!;
        const size = getRotatedFootprintSize(definition.footprint, options.preview.orientation);
        this.preview.position.set(options.cursor.x + (size.widthCells - 1) / 2, 0, options.cursor.y + (size.depthCells - 1) / 2);
        this.preview.rotation.y = angles[options.preview.orientation];
        this.preview.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if ('color' in material && material.color instanceof THREE.Color) {
              material.color.set(options.preview!.valid ? material.userData.previewColor as string : '#ff6f59');
            }
          }
        });
      }
    }
    const shadowSignature = JSON.stringify([this.cutaway.visible, state.equipment.map(item => [item.id, item.position, item.orientation]), options.selectedId, options.preview, options.preview ? options.cursor : null]);
    if (shadowSignature !== this.shadowSignature) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowSignature = shadowSignature;
    }
    this.scene.updateMatrixWorld(); this.camera.updateMatrixWorld();
    const labelWidth = this.host.clientWidth, labelHeight = this.host.clientHeight;
    for (const { group, label } of this.equipment.values()) {
      const point = new THREE.Vector3(group.position.x, 2.0, group.position.z);
      if (this.planView) {
        // Keep clickable labels clear of both roof arrows in the top-down view.
        const footprint = group.userData.footprint as { widthCells: number; depthCells: number };
        point.addScaledVector(this.camera.up, Math.hypot(footprint.widthCells, footprint.depthCells) / 2 + 0.12);
      }
      point.project(this.camera);
      label.style.left = `${(point.x * 0.5 + 0.5) * labelWidth}px`;
      label.style.top = `${(-point.y * 0.5 + 0.5) * labelHeight}px`;
      label.style.display = point.z > 1 || options.showLabels === false ? 'none' : '';
    }
    this.renderer.render(this.scene, this.camera);
  }

  private updateEquipment(item: EquipmentInstance, selected: boolean) {
    const definition = this.definition.equipment.find(value => value.id === item.definitionId);
    if (!definition) return;
    let entry = this.equipment.get(item.id);
    if (!entry) {
      const group = this.buildEquipment(definition);
      group.userData.instanceId = item.id; group.userData.footprint = definition.footprint;
      const label = document.createElement('button'); label.type = 'button'; label.className = 'tycoon-rack-label'; label.dataset.action = 'select-equipment'; label.dataset.instanceId = item.id;
      Object.assign(label.style, { pointerEvents: 'auto', cursor: 'pointer', position: 'absolute', transform: 'translate(-50%, -100%)', whiteSpace: 'nowrap', font: '600 11px system-ui', padding: '4px 7px', borderRadius: '5px', background: '#101c2ee8', color: '#e7f5ff', border: '1px solid #476071' });
      this.labels.append(label); this.scene.add(group);
      entry = { group, label, signature: '' }; this.equipment.set(item.id, entry);
    }
    const size = getRotatedFootprintSize(definition.footprint, item.orientation);
    entry.group.position.set(item.position.x + (size.widthCells - 1) / 2, selected ? 0.055 : 0, item.position.y + (size.depthCells - 1) / 2);
    entry.group.rotation.y = angles[item.orientation]; entry.group.userData.position = item.position;
    const temp = item.kind === 'rack' ? item.intakeTemperatureC : item.supplyTemperatureC;
    entry.label.title = item.kind === 'rack' ? 'Blue arrow: intake into rack. Red arrow: hot exhaust out.' : 'Red arrow: warm return into cooler. Blue arrow: cooled supply out.';
    entry.label.setAttribute('aria-label', `Select ${definition.displayName} ${item.id} at (${item.position.x}, ${item.position.y})`);
    const text = `${item.kind === 'rack' ? 'IN' : 'SUPPLY'} ${temp == null ? '—' : `${temp.toFixed(1)}°C`}${item.limitReasons.length ? ' ⚠' : ''}`;
    if (entry.signature !== text) { entry.label.textContent = text; entry.signature = text; }
    entry.label.style.borderColor = selected ? '#85f1d4' : item.limitReasons.length ? '#ffc071' : '#476071';
  }

  private disposeObject(object: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    object.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        geometries.add(child.geometry);
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  }
  dispose() {
    this.observer.disconnect(); this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onOrbitDown);
    this.canvas.removeEventListener('pointermove', this.onOrbitMove);
    this.canvas.removeEventListener('pointerup', this.onOrbitEnd);
    this.canvas.removeEventListener('pointercancel', this.onOrbitEnd);
    this.disposeObject(this.scene); this.renderer.dispose(); this.canvas.remove(); this.labels.remove();
  }
}
