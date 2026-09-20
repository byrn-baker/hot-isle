import { getRotatedFootprintSize, validatePlacement } from '../model/placement';
import type {
  EquipmentDefinition,
  EquipmentInstance,
  GridPosition,
  LedgerEntry,
  Orientation,
  ScenarioCommand,
  ScenarioDefinition,
  ScenarioView,
  SimulationSpeed,
  TrialReport,
} from '../model/types';
import { TycoonSaveStore } from '../persistence/TycoonSaveStore';
import { RoomRenderer, type RoomOverlay } from '../rendering/RoomRenderer';
import { ScenarioEngine } from '../state/ScenarioEngine';
import { runTrialAsync } from '../workers/runTrialAsync';

const HELP_KEY = 'hici-tycoon-help-v1';
const ORIENTATIONS: Orientation[] = ['north', 'east', 'south', 'west'];

export const KEYBOARD_HELP = [
  ['Arrow keys', 'Move the floor cursor'],
  ['Space', 'Place preview or select equipment at the cursor'],
  ['Q / E', 'Rotate the room view left / right (or drag with the middle mouse button)'],
  ['R', 'Rotate the preview or selected equipment clockwise'],
  ['M', 'Move selected equipment; Space chooses its destination'],
  ['Delete / Backspace', 'Sell selected equipment'],
  ['Ctrl / Cmd + Z', 'Undo the last planning placement change'],
  ['I', 'Focus the selected-equipment inspection'],
  ['O', 'Cycle temperature, airflow, and no overlay'],
  ['P', 'Pause or resume contract operation'],
  ['1 / 2 / 3', 'Set operation speed to 1× / 2× / 4×'],
  ['Tab / Shift+Tab', 'Move through panel controls; Enter activates the focused control'],
  ['H', 'Open this help'],
  ['Escape', 'Cancel a placement or close help'],
] as const;

interface PlacementIntent {
  definitionId: string;
  orientation: Orientation;
  movingInstanceId: string | null;
}

export interface RoomUiState {
  cursor: GridPosition;
  selectedId: string | null;
  placement: PlacementIntent | null;
  overlay: RoomOverlay;
}

export type RoomUiAction =
  | { type: 'MOVE_CURSOR'; dx: number; dy: number; width: number; height: number }
  | { type: 'SELECT'; instanceId: string | null }
  | { type: 'BEGIN_PLACE'; definitionId: string }
  | { type: 'BEGIN_MOVE'; instance: EquipmentInstance }
  | { type: 'ROTATE' }
  | { type: 'CANCEL' }
  | { type: 'CYCLE_OVERLAY' };

/** Pure ephemeral interaction reducer; authoritative gameplay remains in ScenarioEngine. */
export function reduceRoomUiState(state: RoomUiState, action: RoomUiAction): RoomUiState {
  if (action.type === 'MOVE_CURSOR') {
    return {
      ...state,
      cursor: {
        x: Math.max(0, Math.min(action.width - 1, state.cursor.x + action.dx)),
        y: Math.max(0, Math.min(action.height - 1, state.cursor.y + action.dy)),
      },
    };
  }
  if (action.type === 'SELECT') return { ...state, selectedId: action.instanceId, placement: null };
  if (action.type === 'BEGIN_PLACE') {
    return { ...state, selectedId: null, placement: { definitionId: action.definitionId, orientation: 'north', movingInstanceId: null } };
  }
  if (action.type === 'BEGIN_MOVE') {
    return {
      ...state,
      cursor: { ...action.instance.position },
      selectedId: action.instance.id,
      placement: {
        definitionId: action.instance.definitionId,
        orientation: action.instance.orientation,
        movingInstanceId: action.instance.id,
      },
    };
  }
  if (action.type === 'ROTATE' && state.placement) {
    const index = ORIENTATIONS.indexOf(state.placement.orientation);
    return { ...state, placement: { ...state.placement, orientation: ORIENTATIONS[(index + 1) % 4]! } };
  }
  if (action.type === 'CANCEL') return { ...state, placement: null };
  if (action.type === 'CYCLE_OVERLAY') {
    const overlays: RoomOverlay[] = ['none', 'temperature', 'airflow'];
    return { ...state, overlay: overlays[(overlays.indexOf(state.overlay) + 1) % overlays.length]! };
  }
  return state;
}

function dollars(microcents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    .format(microcents / 100_000_000);
}

function elapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function number(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits);
}

function definitionFor(definition: ScenarioDefinition, instance: EquipmentInstance): EquipmentDefinition {
  const result = definition.equipment.find((item) => item.id === instance.definitionId);
  if (!result) throw new Error(`Unknown equipment definition ${instance.definitionId}`);
  return result;
}

function instanceAt(definition: ScenarioDefinition, equipment: EquipmentInstance[], position: GridPosition) {
  return equipment.find((instance) => {
    const itemDefinition = definitionFor(definition, instance);
    const size = getRotatedFootprintSize(itemDefinition.footprint, instance.orientation);
    return position.x >= instance.position.x && position.x < instance.position.x + size.widthCells
      && position.y >= instance.position.y && position.y < instance.position.y + size.depthCells;
  }) ?? null;
}

export class RoomController {
  private engine: ScenarioEngine;
  private readonly saveStore: TycoonSaveStore;
  private ui: RoomUiState = {
    cursor: { x: 2, y: 2 }, selectedId: null, placement: null, overlay: 'temperature',
  };
  private view: Readonly<ScenarioView>;
  private frame = 0;
  private lastFrameMs = 0;
  private tickAccumulatorMs = 0;
  private trialAbort: AbortController | null = null;
  private destroyed = false;
  private planView = false;
  private showLabels = true;
  private lastLedgerUiMs = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly root: HTMLElement,
    private readonly renderer: RoomRenderer,
    private readonly definition: ScenarioDefinition,
    engine: ScenarioEngine,
  ) {
    this.saveStore = new TycoonSaveStore(definition);
    const saved = this.saveStore.load();
    this.engine = saved.ok ? new ScenarioEngine(definition, saved.state) : engine;
    this.view = this.engine.createView();
    this.buildCatalog();
    this.bindEvents();
    this.renderUi();
    if (saved.ok) this.setStatus(`Restored local save from ${new Date(saved.envelope.savedAt).toLocaleString()}. Operation is paused.`);
    else if (saved.error.code !== 'NO_SAVE') this.setStatus(`${saved.error.code}: starting a fresh room because the local save could not load.`, true);
    this.showFirstVisitHelp();
    this.frame = requestAnimationFrame(this.animate);
  }

  private element<T extends HTMLElement>(role: string): T {
    const found = this.root.querySelector<T>(`[data-role="${role}"]`);
    if (!found) throw new Error(`Missing tycoon UI role: ${role}`);
    return found;
  }

  private buildCatalog() {
    const catalog = this.element<HTMLDivElement>('catalog');
    for (const item of this.definition.equipment) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tycoon-catalog-card';
      button.dataset.action = 'catalog';
      button.dataset.definitionId = item.id;
      const metric = item.kind === 'rack'
        ? `${item.nameplateServiceUnits} svc · ${(item.maxPowerW / 1000).toFixed(0)} kW · ${item.ratedFanFlowM3s.toFixed(1)} m³/s`
        : `${(item.ratedHeatRemovalW / 1000).toFixed(0)} kW heat · ${item.ratedAirflowM3s.toFixed(0)} m³/s`;
      button.innerHTML = `<span class="tycoon-card-icon" aria-hidden="true">${item.kind === 'rack' ? '▥' : '❄'}</span><span><strong></strong><small></small><b></b></span>`;
      button.querySelector('strong')!.textContent = item.displayName;
      button.querySelector('small')!.textContent = metric;
      button.querySelector('b')!.textContent = dollars(item.purchasePriceMicrocents);
      catalog.append(button);
    }
  }

  private bindEvents() {
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('change', this.onInput);
    this.renderer.canvas.addEventListener('click', this.onCanvasClick);
    this.element('stage').addEventListener('contextmenu', this.onContextMenu);
    this.renderer.canvas.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keydown', this.onDocumentKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onClick = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
    if (!button || !this.root.contains(button)) return;
    const action = button.dataset.action;
    if (action === 'select-equipment' && button.dataset.instanceId) {
      const instance = this.view.equipment.find(item => item.id === button.dataset.instanceId);
      if (instance) {
        this.ui = { ...this.ui, selectedId: instance.id, cursor: { ...instance.position }, placement: null };
        this.renderer.canvas.focus(); this.renderUi();
      }
      return;
    }
    if (action === 'labels') { this.showLabels = !this.showLabels; button.textContent = this.showLabels ? 'Hide labels' : 'Show labels'; button.setAttribute('aria-pressed', String(!this.showLabels)); this.renderRoom(); return; }
    if (action === 'rotate-preview') { this.rotate(); return; }
    if (action === 'cancel-placement') { this.ui = reduceRoomUiState(this.ui, { type: 'CANCEL' }); this.renderUi(); return; }
    if (action === 'zoom-in' || action === 'zoom-out') { this.renderer.zoomView(action === 'zoom-in' ? 0.85 : 1.15); return; }
    if (action === 'orbit-left' || action === 'orbit-right') {
      this.renderer.rotateView((action === 'orbit-left' ? -1 : 1) * Math.PI / 4);
      this.renderer.canvas.focus(); return;
    }
    if (action === 'catalog' && button.dataset.definitionId) {
      this.ui = reduceRoomUiState(this.ui, { type: 'BEGIN_PLACE', definitionId: button.dataset.definitionId });
      this.setStatus('Preview ready. Choose a floor cell; cyan is valid and coral is blocked.');
      this.renderer.canvas.focus();
    } else if (action === 'accept') {
      this.command({ type: 'ACCEPT_CONTRACT' }, 'Contract accepted. Build while paused, then start operation.');
    } else if (action === 'toggle-operation') {
      this.command(this.view.paused ? { type: 'RESUME' } : { type: 'PAUSE' });
      this.tickAccumulatorMs = 0;
    } else if (action === 'speed') {
      this.command({ type: 'SET_SPEED', speed: Number(button.dataset.speed) as SimulationSpeed });
    } else if (action === 'overlay') {
      this.ui = reduceRoomUiState(this.ui, { type: 'CYCLE_OVERLAY' });
      this.renderUi();
    } else if (action === 'camera') {
      this.planView = !this.planView;
      this.renderer.setPlanView(this.planView);
      this.renderUi();
    } else if (action === 'rotate') this.rotate();
    else if (action === 'move') this.beginMove();
    else if (action === 'remove') this.removeSelected();
    else if (action === 'undo') this.command({ type: 'UNDO' });
    else if (action === 'save') this.save();
    else if (action === 'load') this.load();
    else if (action === 'trial-current') void this.runTrial();
    else if (action === 'trial-fixture' && button.dataset.fixtureId) void this.runTrial(button.dataset.fixtureId);
    else if (action === 'cancel-trial') this.trialAbort?.abort();
    else if (action === 'help') this.openHelp();
    else if (action === 'close-help') this.closeHelp();
    else if (action === 'restart' && window.confirm('Restart this contract and discard the current room?')) {
      this.ui = { ...this.ui, selectedId: null, placement: null };
      this.command({ type: 'RESTART' }, 'Fresh contract offer created.');
    }
  };

  private onInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.control || !this.ui.selectedId) return;
    const fraction = Number(input.value) / 100;
    if (input.dataset.control === 'workload') {
      this.command({ type: 'SET_WORKLOAD', instanceId: this.ui.selectedId, fraction });
    } else if (input.dataset.control === 'cooling') {
      this.command({ type: 'SET_COOLING', instanceId: this.ui.selectedId, fraction });
    }
  };

  private onCanvasClick = (event: MouseEvent) => {
    const hit = this.renderer.pick(event.clientX, event.clientY, Boolean(this.ui.placement));
    if (!hit) return;
    this.ui = { ...this.ui, cursor: hit.position };
    if (this.ui.placement) this.commitPlacement();
    else this.ui = reduceRoomUiState(this.ui, { type: 'SELECT', instanceId: hit.instanceId });
    this.renderUi();
  };

  private onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    const labelId = (event.target as Element).closest<HTMLElement>('[data-instance-id]')?.dataset.instanceId;
    const instance = this.view.equipment.find(item => item.id === labelId);
    const hit = instance ? { position: instance.position, instanceId: instance.id } : this.renderer.pick(event.clientX, event.clientY);
    if (!hit?.instanceId) return;
    this.ui = { ...this.ui, selectedId: hit.instanceId, placement: null };
    this.removeSelected();
  };

  private onDocumentKeyDown = (event: KeyboardEvent) => {
    const help = this.element('help');
    if (!help.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeHelp();
      } else if (event.key === 'Tab') {
        const focusable = [...help.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')];
        if (focusable.length) {
          const first = focusable[0]!, last = focusable[focusable.length - 1]!;
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
      return;
    }
    if (event.key.toLowerCase() === 'h' && !event.ctrlKey && !event.metaKey && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      this.openHelp();
    }
  };

  private onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const movement: Record<string, [number, number]> = {
      arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1],
    };
    if (movement[key]) {
      event.preventDefault();
      const [dx, dy] = movement[key]!;
      this.ui = reduceRoomUiState(this.ui, {
        type: 'MOVE_CURSOR', dx, dy,
        width: this.definition.room.widthCells, height: this.definition.room.heightCells,
      });
      this.renderUi();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault(); this.command({ type: 'UNDO' }); return;
    }
    if (key === 'q' || key === 'e') { event.preventDefault(); this.renderer.rotateView((key === 'q' ? -1 : 1) * Math.PI / 4); return; }
    if (key === ' ') {
      event.preventDefault();
      if (this.ui.placement) this.commitPlacement();
      else {
        const selected = instanceAt(this.definition, this.view.equipment, this.ui.cursor);
        this.ui = reduceRoomUiState(this.ui, { type: 'SELECT', instanceId: selected?.id ?? null });
        this.renderUi();
      }
    } else if (key === 'r') { event.preventDefault(); this.rotate(); }
    else if (key === 'm') { event.preventDefault(); this.beginMove(); }
    else if (key === 'delete' || key === 'backspace') { event.preventDefault(); this.removeSelected(); }
    else if (key === 'i') { event.preventDefault(); this.element('inspection').focus(); }
    else if (key === 'o') { event.preventDefault(); this.ui = reduceRoomUiState(this.ui, { type: 'CYCLE_OVERLAY' }); this.renderUi(); }
    else if (key === 'p') { event.preventDefault(); this.command(this.view.paused ? { type: 'RESUME' } : { type: 'PAUSE' }); }
    else if (key === '1' || key === '2' || key === '3') {
      event.preventDefault(); this.command({ type: 'SET_SPEED', speed: ({ '1': 1, '2': 2, '3': 4 } as const)[key as '1' | '2' | '3'] });
    } else if (key === 'escape') {
      event.preventDefault();
      if (!this.element('help').hidden) this.closeHelp();
      else { this.ui = reduceRoomUiState(this.ui, { type: 'CANCEL' }); this.renderUi(); }
    }
  };

  private onVisibilityChange = () => {
    if (!document.hidden) { this.lastFrameMs = performance.now(); return; }
    this.tickAccumulatorMs = 0;
    if (!this.view.paused) this.command({ type: 'PAUSE' }, 'Paused because this tab was hidden.');
  };

  private animate = (now: number) => {
    if (this.destroyed) return;
    const delta = this.lastFrameMs === 0 ? 0 : Math.min(now - this.lastFrameMs, 250);
    this.lastFrameMs = now;
    if (!document.hidden && !this.view.paused && this.view.mode === 'operating') {
      this.tickAccumulatorMs += delta * this.view.selectedSpeed;
      const due = Math.min(10, Math.floor(this.tickAccumulatorMs / this.definition.model.tickMs));
      if (due > 0) {
        this.tickAccumulatorMs -= due * this.definition.model.tickMs;
        const result = this.engine.advanceTicks(due);
        this.view = result.view;
        if (result.diagnostic) this.setStatus(`${result.diagnostic.code}: operation stopped at tick ${result.diagnostic.simulatedTick}.`, true);
        this.renderUi();
      }
    }
    this.renderRoom();
    this.frame = requestAnimationFrame(this.animate);
  };

  private dispatch(command: ScenarioCommand) {
    const result = this.engine.dispatch(command);
    this.view = result.view;
    if (!result.ok) this.setStatus(`${result.code.replace(/_/g, ' ')}. The room was not changed.`, true);
    return result;
  }

  private command(command: ScenarioCommand, successMessage?: string) {
    const result = this.dispatch(command);
    if (result.ok && successMessage) this.setStatus(successMessage);
    this.renderUi();
    return result;
  }

  private previewValid(): boolean {
    const placement = this.ui.placement;
    if (!placement) return true;
    const equipmentDefinition = this.definition.equipment.find((item) => item.id === placement.definitionId);
    if (!equipmentDefinition) return false;
    return validatePlacement(equipmentDefinition, this.ui.cursor, placement.orientation, {
      room: this.definition.room,
      definitions: this.definition.equipment,
      equipment: this.view.equipment,
      excludeInstanceId: placement.movingInstanceId ?? undefined,
      availableCashMicrocents: this.view.accounts.cashMicrocents,
      isPurchase: placement.movingInstanceId === null,
    }).ok;
  }

  private commitPlacement() {
    const placement = this.ui.placement;
    if (!placement) return;
    const command: ScenarioCommand = placement.movingInstanceId
      ? { type: 'MOVE', instanceId: placement.movingInstanceId, position: this.ui.cursor, orientation: placement.orientation }
      : { type: 'PLACE', definitionId: placement.definitionId, position: this.ui.cursor, orientation: placement.orientation };
    const result = this.dispatch(command);
    if (result.ok) {
      if (placement.movingInstanceId) {
        this.ui = { ...this.ui, placement: null, selectedId: placement.movingInstanceId };
        this.setStatus('Equipment moved.');
      } else this.setStatus('Equipment purchased and placed. Continue placing or press Escape.');
    }
    this.renderUi();
  }

  private rotate() {
    if (this.ui.placement) {
      this.ui = reduceRoomUiState(this.ui, { type: 'ROTATE' });
      this.renderUi();
      return;
    }
    const instance = this.view.equipment.find((item) => item.id === this.ui.selectedId);
    if (!instance) { this.setStatus('Select equipment before rotating.', true); return; }
    const orientation = ORIENTATIONS[(ORIENTATIONS.indexOf(instance.orientation) + 1) % 4]!;
    this.command({ type: 'ROTATE', instanceId: instance.id, orientation }, `Rotated ${orientation}.`);
  }

  private beginMove() {
    const instance = this.view.equipment.find((item) => item.id === this.ui.selectedId);
    if (!instance) { this.setStatus('Select equipment before moving.', true); return; }
    if (!this.view.paused) { this.setStatus('Pause operation before moving equipment.', true); return; }
    this.ui = reduceRoomUiState(this.ui, { type: 'BEGIN_MOVE', instance });
    this.setStatus('Move preview ready. Click a destination or use arrows and Space.');
    this.renderer.canvas.focus();
    this.renderUi();
  }

  private removeSelected() {
    if (!this.ui.selectedId) { this.setStatus('Select owned equipment before selling.', true); return; }
    const result = this.dispatch({ type: 'REMOVE', instanceId: this.ui.selectedId });
    if (result.ok) {
      this.ui = { ...this.ui, selectedId: null, placement: null };
      this.setStatus('Equipment sold for its displayed resale value.');
    }
    this.renderUi();
  }

  private save() {
    const result = this.saveStore.save(this.engine);
    this.view = this.engine.createView();
    this.tickAccumulatorMs = 0;
    this.setStatus(result.ok ? `Saved locally at ${new Date(result.envelope.savedAt).toLocaleTimeString()}.` : `${result.error.code}: ${result.error.message}`, !result.ok);
    this.renderUi();
  }

  private load() {
    const result = this.saveStore.load();
    if (!result.ok) { this.setStatus(`${result.error.code}: ${result.error.message}`, true); return; }
    this.engine = new ScenarioEngine(this.definition, result.state);
    this.view = this.engine.createView();
    this.tickAccumulatorMs = 0;
    this.ui = { ...this.ui, selectedId: null, placement: null };
    this.setStatus(`Loaded local save from ${new Date(result.envelope.savedAt).toLocaleString()}. Operation is paused.`);
    this.renderUi();
  }

  private async runTrial(fixtureId?: string) {
    if (this.trialAbort) return;
    this.trialAbort = new AbortController();
    this.element('trial-result').textContent = 'Running isolated design trial in a worker…';
    this.element<HTMLButtonElement>('cancel-trial').hidden = false;
    this.updateDisabledStates();
    try {
      const fixture = fixtureId ? this.definition.trialFixtures.find((item) => item.id === fixtureId) : undefined;
      const result = await runTrialAsync(this.definition, fixture
        ? { fixtureId, workloadFraction: fixture.workloadFraction, durationMs: fixture.durationMs, commitToLive: false }
        : { initialState: this.engine.createStateSnapshot(), workloadFraction: 1, durationMs: 30_000, commitToLive: false }, this.trialAbort.signal);
      if (result.ok) this.showTrialReport(result.report);
      else this.element('trial-result').textContent = `${result.diagnostic.code}: the isolated trial stopped at tick ${result.diagnostic.simulatedTick}.`;
    } catch (error) {
      this.element('trial-result').textContent = error instanceof DOMException && error.name === 'AbortError'
        ? 'Trial cancelled. The live room was not changed.'
        : `Trial failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.trialAbort = null;
      this.element<HTMLButtonElement>('cancel-trial').hidden = true;
      this.updateDisabledStates();
    }
  }

  private showTrialReport(report: TrialReport) {
    const serviceSeconds = report.deliveredMilliServiceUnitMs / 1_000_000;
    this.element('trial-result').innerHTML = '';
    const title = document.createElement('strong'); title.textContent = `${report.label} · projected`;
    const rows = document.createElement('dl');
    const values: Array<[string, string]> = [
      ['Duration', elapsed(report.durationMs)],
      ['Peak rack intake', `${number(report.peakRackIntakeTemperatureC, 2)} °C`],
      ['Mean rack intake', `${number(report.meanRackIntakeTemperatureC, 2)} °C`],
      ['Minimum service', `${(report.minimumDeliveredMilliServiceUnits / 1000).toFixed(2)} units`],
      ['Delivered service', `${serviceSeconds.toFixed(1)} unit·s`],
      ['IT energy', `${(report.itEnergyMilliWh / 1_000_000).toFixed(3)} kWh projected`],
      ['Cooling energy', `${(report.coolingEnergyMilliWh / 1_000_000).toFixed(3)} kWh projected`],
      ['Capacity-limited', elapsed(report.capacityLimitedMs)],
      ['Diagnostics', report.diagnostics.length ? report.diagnostics.map((item) => item.code).join(', ') : 'none'],
      ['Projected operating profit', dollars(report.projectedOperatingProfitMicrocents)],
    ];
    for (const [label, value] of values) {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      rows.append(dt, dd);
    }
    this.element('trial-result').append(title, rows);
  }

  private renderRoom() {
    this.renderer.render(this.view, {
      selectedId: this.ui.selectedId,
      cursor: this.ui.cursor,
      preview: this.ui.placement ? {
        definitionId: this.ui.placement.definitionId,
        orientation: this.ui.placement.orientation,
        valid: this.previewValid(),
      } : null,
      overlay: this.ui.overlay,
      showLabels: this.showLabels,
    });
  }

  private renderUi() {
    const temperatures = this.view.air.temperatureC.filter((value): value is number => value !== null);
    const totalOutput = this.view.equipment.reduce((sum, item) => sum + (item.kind === 'rack' ? item.usefulOutputMilliServiceUnits : 0), 0) / 1000;
    const allocatedPower = this.view.equipment.reduce((sum, item) => sum + item.allocatedPowerMilliW, 0) / 1_000_000;
    const reliability = Math.floor(this.view.contractProgress.qualifyingMs * 10_000 / Math.max(1, this.view.contractProgress.elapsedMs)) / 100;
    this.element('cash').textContent = dollars(this.view.accounts.cashMicrocents);
    this.element('profit').textContent = dollars(this.view.accounts.operatingProfitMicrocents);
    this.element('clock').textContent = `${elapsed(this.view.contractProgress.elapsedMs)} / ${elapsed(this.definition.contract.durationMs)}`;
    this.element('service').textContent = `${totalOutput.toFixed(2)} / ${this.definition.contract.requiredServiceUnits.toFixed(0)} svc`;
    this.element('power').textContent = `${allocatedPower.toFixed(2)} / ${(this.definition.room.powerLimitW / 1000).toFixed(0)} kW`;
    this.element('reliability').textContent = `${reliability.toFixed(2)}% / ${(this.definition.contract.reliabilityTargetBasisPoints / 100).toFixed(0)}%`;
    this.element('mode').textContent = this.view.mode === 'operating' ? 'OPERATING' : this.view.mode.toUpperCase();
    this.element('mode').dataset.mode = this.view.mode;
    this.element('overlay-value').textContent = this.ui.overlay === 'none' ? 'Off' : this.ui.overlay[0]!.toUpperCase() + this.ui.overlay.slice(1);
    this.element('camera-value').textContent = this.planView ? 'Plan' : 'Room';
    this.element('temperature-summary').textContent = temperatures.length
      ? `${Math.min(...temperatures).toFixed(1)}–${Math.max(...temperatures).toFixed(1)} °C · mean ${(temperatures.reduce((a, b) => a + b, 0) / temperatures.length).toFixed(1)} °C`
      : 'No free-air temperature samples';
    this.element('flow-summary').textContent = this.view.air.flowValid
      ? `Residual ${this.view.air.lastFlowResidualM3s.toExponential(2)} m³/s · ${this.view.air.lastIterationCount} iterations`
      : 'Flow pending after layout edit';
    this.renderInspection();
    const now = performance.now();
    if (now - this.lastLedgerUiMs >= 750 || this.view.mode !== 'operating') {
      this.renderLedger(this.engine.createRecentLedger(8));
      this.lastLedgerUiMs = now;
    } else this.renderLedgerSummary();
    this.renderContractResult();
    this.updateDisabledStates();
    this.renderRoom();
  }

  private renderInspection() {
    const panel = this.element('inspection-body');
    const focusedControl = panel.contains(document.activeElement)
      && document.activeElement instanceof HTMLInputElement
      ? document.activeElement.dataset.control : undefined;
    panel.innerHTML = '';
    const instance = this.view.equipment.find((item) => item.id === this.ui.selectedId);
    if (!instance) {
      panel.textContent = this.ui.placement
        ? `Placing ${this.definition.equipment.find((item) => item.id === this.ui.placement?.definitionId)?.displayName ?? 'equipment'} facing ${this.ui.placement.orientation}. Cursor (${this.ui.cursor.x}, ${this.ui.cursor.y}) is ${this.previewValid() ? 'valid' : 'blocked'}.`
        : 'Select equipment in the room or choose a catalog item. Blue marks intake/supply; red marks exhaust/return.';
      return;
    }
    const itemDefinition = definitionFor(this.definition, instance);
    const heading = document.createElement('div'); heading.className = 'tycoon-inspection-title';
    heading.innerHTML = '<strong></strong><span></span>';
    heading.querySelector('strong')!.textContent = itemDefinition.displayName;
    heading.querySelector('span')!.textContent = `${instance.id} · ${instance.orientation}`;
    const metrics: Array<[string, string]> = [
      ['State', instance.operatingState],
      ['Flow', `${instance.actualFlowM3s.toFixed(3)} m³/s`],
      ['Power', `${(instance.allocatedPowerMilliW / 1_000_000).toFixed(2)} / ${(instance.requestedPowerMilliW / 1_000_000).toFixed(2)} kW`],
      ['Resale', dollars(instance.resaleValueMicrocents)],
    ];
    if (instance.kind === 'rack') metrics.push(
      ['Intake / exhaust', `${number(instance.intakeTemperatureC)} / ${number(instance.exhaustTemperatureC)} °C`],
      ['Service', `${(instance.usefulOutputMilliServiceUnits / 1000).toFixed(2)} units`],
      ['Thermal factor', `${(instance.thermalFactor * 100).toFixed(0)}%`],
    );
    else metrics.push(
      ['Return / supply', `${number(instance.returnTemperatureC)} / ${number(instance.supplyTemperatureC)} °C`],
      ['Heat removed', `${(instance.heatRemovedW / 1000).toFixed(2)} kW`],
    );
    const list = document.createElement('dl');
    for (const [label, value] of metrics) {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      list.append(dt, dd);
    }
    const reasons = document.createElement('p'); reasons.className = 'tycoon-reasons';
    reasons.textContent = instance.limitReasons.length
      ? `Limits: ${instance.limitReasons.map((reason) => reason.replace(/_/g, ' ').toLowerCase()).join(', ')}`
      : 'Limits: none';
    const control = document.createElement('label'); control.className = 'tycoon-range';
    const fraction = instance.kind === 'rack' ? instance.workloadCapFraction : instance.commandedCoolingFraction;
    control.innerHTML = `<span>${instance.kind === 'rack' ? 'Workload cap' : 'Cooling command'} <b>${(fraction * 100).toFixed(0)}%</b></span><input type="range" min="0" max="100" step="5">`;
    const input = control.querySelector('input')!;
    input.value = String(fraction * 100);
    input.dataset.control = instance.kind === 'rack' ? 'workload' : 'cooling';
    input.disabled = !this.view.paused || this.view.mode !== 'planning';
    panel.append(heading, list, reasons, control);
    if (focusedControl === input.dataset.control && !input.disabled) input.focus({ preventScroll: true });
  }

  private renderLedgerSummary() {
    const summary = this.element('ledger-summary');
    summary.innerHTML = '';
    const totals: Array<[string, number]> = [
      ['Revenue', this.view.accounts.operatingRevenueMicrocents],
      ['Settlement', this.view.accounts.settlementMicrocents],
      ['IT energy', -this.view.accounts.itElectricityCostMicrocents],
      ['Cooling energy', -this.view.accounts.coolingElectricityCostMicrocents],
      ['Rent', -this.view.accounts.rentCostMicrocents],
      ['Maintenance', -this.view.accounts.maintenanceCostMicrocents],
    ];
    for (const [label, value] of totals) {
      const row = document.createElement('div');
      const name = document.createElement('span'); name.textContent = label;
      const amount = document.createElement('b'); amount.textContent = dollars(value);
      row.append(name, amount); summary.append(row);
    }
  }

  private renderLedger(entries: LedgerEntry[]) {
    this.renderLedgerSummary();
    const recent = this.element('ledger-recent'); recent.innerHTML = '';
    for (const entry of entries.reverse()) {
      const row = document.createElement('li');
      row.textContent = `${elapsed(entry.simulatedTimeMs)} · ${entry.category.replace(/_/g, ' ')} · ${dollars(entry.amountMicrocents)}`;
      recent.append(row);
    }
    if (!entries.length) recent.textContent = 'No entries yet.';
  }

  private renderContractResult() {
    const result = this.element('contract-result');
    const terminal = this.view.mode === 'completed' || this.view.mode === 'failed';
    result.hidden = !terminal;
    if (!terminal) return;
    const delivered = this.view.contractProgress.deliveredMilliServiceUnitMs / 1_000_000;
    const reliability = Math.floor(this.view.contractProgress.qualifyingMs * 10_000
      / Math.max(1, this.view.contractProgress.elapsedMs)) / 100;
    result.innerHTML = '';
    const heading = document.createElement('strong');
    heading.textContent = this.view.mode === 'completed' ? 'Contract succeeded' : 'Contract failed';
    const detail = document.createElement('p');
    detail.textContent = `Cause: ${this.view.contractProgress.failureReason ?? 'reliability target met'}. Delivered ${delivered.toFixed(1)} service-unit·seconds at ${reliability.toFixed(2)}% reliability.`;
    const totals: Array<[string, string]> = [
      ['Gross revenue', dollars(this.view.accounts.operatingRevenueMicrocents)],
      ['IT electricity', dollars(-this.view.accounts.itElectricityCostMicrocents)],
      ['Cooling electricity', dollars(-this.view.accounts.coolingElectricityCostMicrocents)],
      ['Rent', dollars(-this.view.accounts.rentCostMicrocents)],
      ['Maintenance', dollars(-this.view.accounts.maintenanceCostMicrocents)],
      ['Settlement / penalty', dollars(this.view.accounts.settlementMicrocents)],
      ['Operating profit', dollars(this.view.accounts.operatingProfitMicrocents)],
      ['Final cash', dollars(this.view.accounts.cashMicrocents)],
    ];
    const list = document.createElement('dl');
    for (const [label, value] of totals) {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      list.append(dt, dd);
    }
    result.append(heading, detail, list);
  }

  private updateDisabledStates() {
    this.element('placement-tools').hidden = !this.ui.placement;
    const offered = this.view.mode === 'offered';
    const planning = this.view.mode === 'planning' && this.view.paused;
    this.element<HTMLButtonElement>('accept').hidden = !offered;
    const toggle = this.element<HTMLButtonElement>('toggle-operation');
    toggle.hidden = offered || this.view.mode === 'completed' || this.view.mode === 'failed';
    toggle.textContent = this.view.paused ? '▶ Start operation' : 'Ⅱ Pause & plan';
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="catalog"]').forEach((button) => {
      const item = this.definition.equipment.find((candidate) => candidate.id === button.dataset.definitionId)!;
      button.disabled = !planning || this.view.accounts.cashMicrocents < item.purchasePriceMicrocents;
      button.classList.toggle('is-active', this.ui.placement?.definitionId === item.id && !this.ui.placement.movingInstanceId);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="speed"]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.speed) === this.view.selectedSpeed);
    });
    for (const action of ['rotate', 'move', 'remove']) {
      this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled = !planning || !this.ui.selectedId;
    }
    this.root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = !planning;
    this.root.querySelectorAll<HTMLButtonElement>('[data-action^="trial"]').forEach((button) => { button.disabled = Boolean(this.trialAbort); });
  }

  private setStatus(message: string, error = false) {
    const status = this.element('status');
    status.textContent = message;
    status.dataset.error = String(error);
  }

  private showFirstVisitHelp() {
    try {
      if (localStorage.getItem(HELP_KEY) === 'seen') return;
    } catch { /* Help still opens when preference storage is unavailable. */ }
    this.openHelp();
  }

  private openHelp() {
    const dialog = this.element('help');
    dialog.hidden = false;
    this.element<HTMLButtonElement>('close-help').focus();
  }

  private closeHelp() {
    this.element('help').hidden = true;
    try { localStorage.setItem(HELP_KEY, 'seen'); } catch { /* Preference is optional. */ }
    this.renderer.canvas.focus();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.trialAbort?.abort();
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('change', this.onInput);
    this.renderer.canvas.removeEventListener('click', this.onCanvasClick);
    this.element('stage').removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.canvas.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keydown', this.onDocumentKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.dispose();
  }
}
