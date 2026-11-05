import type { ContextStatus } from '../types';

export const isActiveContext = (item: { status: ContextStatus }): boolean =>
  item.status !== 'Archived' && item.status !== 'Superseded';
