import { cookies } from 'next/headers';
import { cache } from 'react';
import { execute } from './database';
import { localClient } from './protocol';
import { SESSION_COOKIE, sessionUser } from './session';
export const createClient = cache(async () => {
  const user = await sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  return localClient(op => execute(user, op), {
    getClaims: async () => ({ data: { claims: user ? { sub: user.id, email: user.email } : null }, error: null }),
  });
});
