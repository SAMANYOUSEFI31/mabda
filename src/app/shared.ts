/** Helpers of the app shell shared by the hooks (src/app/*). */
import { DataApiError } from '../services/dataApi';
import type { AppCoreScope } from './shell/useAppCore';
import type { SearchAndFocusScope } from './shell/useSearchAndFocus';
import type { UsageCountersScope } from './shell/useUsageCounters';
import type { KnowledgeScope } from './knowledge/useKnowledge';
import type { ThinkingItemsScope } from './thinking/useThinkingItems';
import type { HomeScope } from './home/useHome';
import type { MetricsScope } from './metrics/useMetrics';
import type { StartersScope } from './structure/useStarters';
import type { BoardsScope } from './canvas/useBoards';
import type { NodeActionsScope } from './structure/useNodeActions';
import type { NotesScope } from './thinking/useNotes';
import type { FilesScope } from './files/useFiles';
import type { WorkspaceAssetsScope } from './workspace/useWorkspaceAssets';
import type { RemovalAndDialogsScope } from './shell/useRemovalAndDialogs';

export const errText = (e: unknown) => (e instanceof DataApiError ? e.message : 'خطای ناشناخته. دوباره تلاش کن.');

/** everything the hooks of src/app/* produce */
export type AppScope = AppCoreScope & SearchAndFocusScope & UsageCountersScope & KnowledgeScope & ThinkingItemsScope & HomeScope & MetricsScope & StartersScope & BoardsScope & NodeActionsScope & NotesScope & FilesScope & WorkspaceAssetsScope & RemovalAndDialogsScope;

/** the same, once the workspace is loaded: the pages never see a missing workspace or data (AppView checks that first) */
export type ReadyScope = AppScope & { data: NonNullable<AppScope['data']>; currentWorkspace: NonNullable<AppScope['currentWorkspace']> };
