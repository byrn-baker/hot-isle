import { loadScenarioDefinition } from './data/loadScenarioDefinition';
import { RoomRenderer } from './rendering/RoomRenderer';
import { ScenarioEngine } from './state/ScenarioEngine';
import { KEYBOARD_HELP, RoomController } from './ui/RoomController';
import './ui/room.css';

export function createTycoonShellMarkup(): string {
  const keys = KEYBOARD_HELP.map(([key, action]) => `<dt>${key}</dt><dd>${action}</dd>`).join('');
  return `
    <main class="tycoon-app">
      <header class="tycoon-topbar">
        <a class="tycoon-brand" href="/" aria-label="Hot Isle tycoon home"><span>HI</span><strong>HOT ISLE</strong><small>DATACENTER TYCOON</small></a>
        <div class="tycoon-kpis" aria-label="Contract status">
          <div><small>Available cash</small><b data-role="cash">—</b></div>
          <div><small>Operating profit</small><b data-role="profit">—</b></div>
          <div><small>Contract clock</small><b data-role="clock">—</b></div>
          <div><small>Live service</small><b data-role="service">—</b></div>
          <div><small>Room power</small><b data-role="power">—</b></div>
          <div><small>Reliability</small><b data-role="reliability">—</b></div>
        </div>
        <div class="tycoon-top-actions">
          <span class="tycoon-mode" data-role="mode">OFFERED</span>
          <button type="button" data-action="help">? Help</button>
          <a href="?mode=classic">Classic campaign ↗</a>
        </div>
      </header>

      <section class="tycoon-workspace">
        <div class="tycoon-stage-wrap">
          <div class="tycoon-stage" data-role="stage"></div>
          <div class="tycoon-stage-toolbar" aria-label="Room view controls">
            <button type="button" data-action="camera">Camera: <b data-role="camera-value">Room</b></button>
            <button type="button" data-action="orbit-left" aria-label="Rotate view left (Q)">↶ <kbd>Q</kbd></button>
            <button type="button" data-action="orbit-right" aria-label="Rotate view right (E)">↷ <kbd>E</kbd></button>
            <button type="button" data-action="overlay">Overlay: <b data-role="overlay-value">Temperature</b> <kbd>O</kbd></button>
            <span data-role="placement-tools" hidden><button type="button" data-action="rotate-preview">Rotate rack</button> <button type="button" data-action="cancel-placement">Cancel</button></span>
            <button type="button" data-action="labels" aria-pressed="false">Hide labels</button>
            <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
            <button type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
          </div>
          <div class="tycoon-legend" aria-label="Air direction legend">
            <span><i class="is-cold"></i> Cool intake / supply</span>
            <span><i class="is-hot"></i> Hot exhaust / return</span>
          </div>
          <div class="tycoon-room-readout">
            <span data-role="temperature-summary">—</span>
            <span data-role="flow-summary">—</span>
          </div>
          <div class="tycoon-contract-result" data-role="contract-result" hidden></div>
        </div>

        <aside class="tycoon-panel" aria-label="Tycoon controls">
          <section class="tycoon-contract">
            <div class="tycoon-section-heading"><span>01</span><div><small>Customer contract</small><h1>Launch Capacity</h1></div></div>
            <p>Deliver 100 service units for 10:00 with at least 95% reliability. Revenue is $0.05 per delivered unit-second; missing service is debited up to gross revenue.</p>
            <div class="tycoon-primary-actions">
              <button class="is-primary" type="button" data-action="accept" data-role="accept">Accept contract</button>
              <button class="is-primary" type="button" data-action="toggle-operation" data-role="toggle-operation" hidden>▶ Start operation</button>
              <div class="tycoon-speed" aria-label="Operation speed">
                <button type="button" data-action="speed" data-speed="1" aria-label="Set speed to 1 times">1×</button>
                <button type="button" data-action="speed" data-speed="2" aria-label="Set speed to 2 times">2×</button>
                <button type="button" data-action="speed" data-speed="4" aria-label="Set speed to 4 times">4×</button>
              </div>
            </div>
          </section>

          <section>
            <div class="tycoon-section-heading"><span>02</span><div><small>Build while paused</small><h2>Equipment catalog</h2></div></div>
            <div class="tycoon-catalog" data-role="catalog"></div>
          </section>

          <section class="tycoon-inspection" tabindex="-1" data-role="inspection">
            <div class="tycoon-section-heading"><span>03</span><div><small>Numeric diagnostics</small><h2>Inspection</h2></div></div>
            <div data-role="inspection-body"></div>
            <div class="tycoon-button-row">
              <button type="button" data-action="rotate">Rotate <kbd>R</kbd></button>
              <button type="button" data-action="move">Move <kbd>M</kbd></button>
              <button type="button" data-action="remove">Sell <kbd>Del</kbd></button>
              <button type="button" data-action="undo">Undo <kbd>⌘Z</kbd></button>
            </div>
          </section>

          <details open>
            <summary><span>04</span> Design trials</summary>
            <p class="tycoon-note">Trials are isolated projections in a worker. They do not change this room, cash, contract, or save.</p>
            <div class="tycoon-button-row">
              <button type="button" data-action="trial-current">Test current · 00:30</button>
              <button type="button" data-action="trial-fixture" data-fixture-id="good-layout">Separated demo</button>
              <button type="button" data-action="trial-fixture" data-fixture-id="poor-layout">Recirculation demo</button>
              <button type="button" data-action="cancel-trial" data-role="cancel-trial" hidden>Cancel trial</button>
            </div>
            <div class="tycoon-trial-result" data-role="trial-result">No projected trial run yet.</div>
          </details>

          <details>
            <summary><span>05</span> Operation ledger</summary>
            <div class="tycoon-ledger-summary" data-role="ledger-summary"></div>
            <ol class="tycoon-ledger-recent" data-role="ledger-recent"></ol>
          </details>

          <section class="tycoon-storage">
            <div class="tycoon-button-row">
              <button type="button" data-action="save">Save locally</button>
              <button type="button" data-action="load">Load save</button>
              <button type="button" data-action="restart">Restart</button>
            </div>
            <p class="tycoon-note">Saving pauses operation. Loading never advances wall-clock time.</p>
          </section>
        </aside>
      </section>

      <footer class="tycoon-status" data-role="status" data-error="false" aria-live="polite">
        Accept the contract, then select equipment from the catalog.
      </footer>

      <div class="tycoon-help-backdrop" data-role="help" hidden>
        <section class="tycoon-help" role="dialog" aria-modal="true" aria-labelledby="tycoon-help-title">
          <div><small>First visit briefing</small><h2 id="tycoon-help-title">Build for the airflow you can inspect</h2></div>
          <p>Rack fronts draw cold air; their rears exhaust heat. Coolers move air from red return to blue supply. Blue/red roof arrows show equipment direction even while paused. The Airflow overlay uses thick arrows colored by local air temperature. Hide labels clears the arrows in crowded rooms; Show labels restores exact rack selection. Place while paused, inspect temperatures and m³/s, then operate and earn only from actual delivered service.</p>
          <p>Mouse or touch: choose equipment, then click or tap an empty floor tile to place it. Tap a rack’s temperature label to select that exact rack, then use Move, Rotate or Sell in Inspection. Use the view arrows and + / − to rotate and zoom; Camera: Plan makes floor placement easier.</p><dl class="tycoon-key-list">${keys}</dl>
          <p class="tycoon-disclaimer">Approximate, height-averaged game model. It is not validated CFD or facility-design or safety advice.</p>
          <button class="is-primary" type="button" data-action="close-help" data-role="close-help">Enter planning room</button>
        </section>
      </div>
    </main>`;
}

export function startTycoon(): RoomController {
  const root = document.getElementById('game-container');
  if (!root) throw new Error('Missing #game-container');
  root.innerHTML = createTycoonShellMarkup();
  const definition = loadScenarioDefinition();
  const stage = root.querySelector<HTMLElement>('[data-role="stage"]');
  if (!stage) throw new Error('Missing room stage');
  const renderer = new RoomRenderer(stage, definition);
  return new RoomController(root, renderer, definition, new ScenarioEngine(definition));
}
