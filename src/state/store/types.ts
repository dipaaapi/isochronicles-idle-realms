import type { StoreApi } from 'zustand';
import type { GameStoreState } from '../../types/state';

export type StoreSet = StoreApi<GameStoreState>['setState'];
export type StoreGet = StoreApi<GameStoreState>['getState'];

/**
 * A slice returns a subset of the store's actions. Write the body as
 * `({ ... }) satisfies Partial<GameStoreState>` so parameters are typed from
 * GameStoreState while the returned keys stay exact — useGameStore then
 * fails to compile if any action is missing.
 */
export type SliceArgs = [set: StoreSet, get: StoreGet];
