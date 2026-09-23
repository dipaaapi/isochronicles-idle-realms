import { ResourceBuildingsState } from '../types/state';

export const nextConstruction = (state: { castleBuilt: boolean; resourceBuildings: ResourceBuildingsState }) => {
  if (!state.castleBuilt) return { id: 'CASTLE' as const, x: 5, y: 5, label: 'Castle' };
  return ([
    { id: 'WOOD', x: 8, y: 8, label: 'Wood Grove' },
    { id: 'QUARRY', x: 8, y: 2, label: 'Stone Quarry' },
    { id: 'MINE', x: 2, y: 5, label: 'Metal Mine' },
    { id: 'PORT', x: 1, y: 8, label: 'Water Port' },
  ] as const).find(site => (state.resourceBuildings[site.id]?.level ?? 0) < 1);
};

export const isConstructionReady = (state: {
  castleBuilt: boolean;
  resourceBuildings: ResourceBuildingsState;
}): boolean => state.castleBuilt &&
  (['WOOD', 'QUARRY', 'MINE', 'PORT'] as const).every(
    (id) => (state.resourceBuildings[id]?.level ?? 0) >= 1
  );
