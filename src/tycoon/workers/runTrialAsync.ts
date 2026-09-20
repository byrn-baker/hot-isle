import type { ScenarioDefinition, TrialRequest, TrialResult } from '../model/types';

/** The worker owns its cloned engine. Live UI state and storage never enter its mutation path. */
export function runTrialAsync(
  definition: ScenarioDefinition,
  request: TrialRequest,
  signal?: AbortSignal,
): Promise<TrialResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Trial cancelled.', 'AbortError')); return; }
    const worker = new Worker(new URL('./trial.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(new DOMException('Trial cancelled.', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ result?: TrialResult; error?: string }>) => {
      finish();
      if (data.result) resolve(data.result);
      else reject(new Error(data.error || 'The design trial returned no result.'));
    };
    worker.onerror = event => { event.preventDefault(); finish(); reject(new Error(event.message || 'Trial worker failed.')); };
    worker.onmessageerror = () => { finish(); reject(new Error('The trial result could not be read.')); };
    try { worker.postMessage({ definition, request }); }
    catch (error) { finish(); reject(error); }
  });
}
