/** Helpers of the app shell shared by the hooks (src/app/*). */
import { DataApiError } from '../services/dataApi';

export const errText = (e: unknown) => (e instanceof DataApiError ? e.message : 'خطای ناشناخته. دوباره تلاش کن.');
