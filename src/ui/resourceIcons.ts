import ICONS from '../data/resourceIcons.json';

/** Emoji for a resource key (src/data/resourceIcons.json). */
export const resourceIcon = (key: string): string => (ICONS as Record<string, string>)[key] ?? '📦';
