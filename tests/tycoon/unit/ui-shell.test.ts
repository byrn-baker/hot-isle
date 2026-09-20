import { describe, expect, it } from 'vitest';
import { createTycoonShellMarkup } from '../../../src/tycoon/bootstrap';
import { KEYBOARD_HELP } from '../../../src/tycoon/ui/RoomController';

describe('tycoon DOM shell smoke contract', () => {
  it('ships reachable controls, numeric readouts, help, persistence, trials and classic access', () => {
    const markup = createTycoonShellMarkup();
    for (const role of [
      'stage', 'cash', 'profit', 'clock', 'service', 'power', 'reliability',
      'temperature-summary', 'flow-summary', 'catalog', 'inspection', 'ledger-summary',
      'trial-result', 'status', 'help',
    ]) expect(markup).toContain(`data-role="${role}"`);
    for (const action of ['accept', 'toggle-operation', 'save', 'load', 'trial-current', 'cancel-trial', 'help']) {
      expect(markup).toContain(`data-action="${action}"`);
    }
    expect(markup).toContain('?mode=classic');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('not validated CFD');
  });

  it('renders every implemented keyboard binding into first-visit help', () => {
    const markup = createTycoonShellMarkup();
    for (const [key, action] of KEYBOARD_HELP) {
      expect(markup).toContain(`<dt>${key}</dt>`);
      expect(markup).toContain(`<dd>${action}</dd>`);
    }
  });
});
