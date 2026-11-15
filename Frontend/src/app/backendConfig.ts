/**
 * Which backend the app talks to.
 *   VITE_BACKEND=api   -> FutureSchool server at VITE_API_BASE_URL (default http://localhost:5000):
 *                         sign-in + parent app (fees, attendance, results, hall tickets).
 *                         Teacher / Principal / Admin screens still use prototype data.
 *   unset (default)    -> prototype mock only, no server needed.
 * (VITE_AUTH_BACKEND=api is accepted as an older name for the same switch.)
 */
const metaEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env);
const nodeEnv = typeof process !== 'undefined' && process.env ? (process.env as Record<string, string | undefined>) : {};
const env = metaEnv && (metaEnv.VITE_BACKEND !== undefined || metaEnv.VITE_AUTH_BACKEND !== undefined) ? metaEnv : nodeEnv;

export const USE_BACKEND = env.VITE_BACKEND === 'api' || env.VITE_AUTH_BACKEND === 'api';
export const API_BASE_URL = env.VITE_API_BASE_URL ?? '';
