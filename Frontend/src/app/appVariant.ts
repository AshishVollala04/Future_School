/**
 * Which app this build is.
 *   VITE_APP_VARIANT=parent -> "FutureSchool" parent app: parent sign-in only.
 *   VITE_APP_VARIANT=staff  -> "FutureSchool Administration": teachers, Principal and Admin.
 *   unset                   -> the web app with every sign-in (default).
 * Hiding sign-in options is convenience only; the server checks every role.
 */
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};

export type AppVariant = 'parent' | 'staff' | 'all';

export const APP_VARIANT: AppVariant = env.VITE_APP_VARIANT === 'parent' || env.VITE_APP_VARIANT === 'staff' ? env.VITE_APP_VARIANT : 'all';

/** Roles that may use this app. */
export const allowsRole = (role: string): boolean =>
  APP_VARIANT === 'all' || (APP_VARIANT === 'parent' ? role === 'PARENT' : role !== 'PARENT');
