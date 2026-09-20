import type { InitialPlacement } from '../../../src/tycoon/model/types';

export const GOOD_LAYOUT: InitialPlacement[] = [
  {
    "id": "cooler-1",
    "kind": "cooler",
    "definitionId": "cooler-floor-80",
    "position": {
      "x": 1,
      "y": 2
    },
    "orientation": "east",
    "commandedCoolingFraction": 1
  },
  {
    "id": "cooler-11",
    "kind": "cooler",
    "definitionId": "cooler-floor-80",
    "position": {
      "x": 11,
      "y": 2
    },
    "orientation": "east",
    "commandedCoolingFraction": 1
  },
  {
    "id": "rack-0",
    "kind": "rack",
    "definitionId": "rack-dense",
    "position": {
      "x": 2,
      "y": 3
    },
    "orientation": "north"
  },
  {
    "id": "rack-1",
    "kind": "rack",
    "definitionId": "rack-dense",
    "position": {
      "x": 4,
      "y": 3
    },
    "orientation": "north"
  },
  {
    "id": "rack-2",
    "kind": "rack",
    "definitionId": "rack-dense",
    "position": {
      "x": 7,
      "y": 3
    },
    "orientation": "north"
  },
  {
    "id": "rack-3",
    "kind": "rack",
    "definitionId": "rack-dense",
    "position": {
      "x": 9,
      "y": 3
    },
    "orientation": "north"
  }
];

export const POOR_LAYOUT: InitialPlacement[] = [
  {
    "id": "cooler-1",
    "kind": "cooler",
    "definitionId": "cooler-floor-80",
    "position": {
      "x": 1,
      "y": 2
    },
    "orientation": "east",
    "commandedCoolingFraction": 1
  },
  {
    "id": "cooler-11",
    "kind": "cooler",
    "definitionId": "cooler-floor-80",
    "position": {
      "x": 11,
      "y": 2
    },
    "orientation": "east",
    "commandedCoolingFraction": 1
  },
  {
    "id": "rack-0",
    "kind": "rack",
    "definitionId": "rack-dense",
    "position": {
      "x": 7,
      "y": 1
    },
    "orientation": "north"
  },
  {
    "id": "rack-1",
    "kind": "rack",
    "definitionId": "rack-dense",
    "position": {
      "x": 7,
      "y": 3
    },
    "orientation": "north"
  },
  {
    "id": "rack-2",
    "kind": "rack",
    "definitionId": "rack-dense",
    "position": {
      "x": 7,
      "y": 5
    },
    "orientation": "north"
  },
  {
    "id": "rack-3",
    "kind": "rack",
    "definitionId": "rack-dense",
    "position": {
      "x": 7,
      "y": 7
    },
    "orientation": "north"
  }
];
