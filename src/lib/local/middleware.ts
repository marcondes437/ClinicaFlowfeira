import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionUser } from './session';
import { execute } from './database';
import { getPrimaryRole, HOME_BY_ROLE, normalizeRoles, ROLE_ROUTES } from '@/lib/roles';
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const protectedRoute = Object.values(ROLE_ROUTES).some(base => path === base || path.startsWith(base + '/'));
  const redirectUrl = () => { const url = new URL(request.url); url.host = request.headers.get('host') || url.host; return url; };
  if (!protectedRoute && path !== '/cadastro') return NextResponse.next();
  const login = () => { const url = redirectUrl(); url.pathname = path === '/medico' || path.startsWith('/medico/') ? '/portal-medico' : '/portal-paciente'; url.search = ''; url.searchParams.set('redirect', path); return NextResponse.redirect(url); };
  try {
    const user = await sessionUser(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return protectedRoute ? login() : NextResponse.next();
    const result = await execute(user, { table: 'user_roles', columns: 'role', filters: [{ column: 'user_id', op: 'eq', value: user.id }] });
    if (result.error) throw new Error(result.error.message);
    const roles = normalizeRoles((result.data as { role: string }[]).map(row => row.role));
    if (path === '/cadastro' || !roles.some(role => path === ROLE_ROUTES[role] || path.startsWith(ROLE_ROUTES[role] + '/'))) {
      const url = redirectUrl(); url.pathname = HOME_BY_ROLE[getPrimaryRole(roles)]; url.search = ''; return NextResponse.redirect(url);
    }
    return NextResponse.next();
  } catch (error) { console.error('Sessão local indisponível', error); return protectedRoute ? login() : NextResponse.next(); }
}
