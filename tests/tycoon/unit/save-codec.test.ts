import { expect, it } from 'vitest';
import { decodeSaveJson, encodeSaveJson } from '../../../src/tycoon/persistence/SaveCodec';

it('losslessly compresses large nested ledger/history payloads and retains legacy JSON', () => {
  const small = JSON.stringify({ value: 'legacy' });
  expect(decodeSaveJson(small)).toBe(small);
  const json = JSON.stringify({ ledger: Array.from({ length: 5000 }, (_, tick) => ({ tick, amount: tick * 12345, description: 'Cooling electricity · 風' })), nested: { unicode: '❄' } });
  const stored = encodeSaveJson(json);
  expect(stored.length).toBeLessThan(json.length / 2);
  expect(decodeSaveJson(stored)).toBe(json);
  expect(() => decodeSaveJson('HICI-GZIP-1:broken')).toThrow();
});
