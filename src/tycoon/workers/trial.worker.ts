import { ScenarioEngine } from '../state/ScenarioEngine';
import type { ScenarioDefinition, TrialRequest, TrialResult } from '../model/types';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ definition: ScenarioDefinition; request: TrialRequest }>) => void) | null;
  postMessage: (message: { result: TrialResult } | { error: string }) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const engine = new ScenarioEngine(data.definition);
    scope.postMessage({ result: engine.runTrial(data.request) });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'The design trial failed.' });
  }
};
