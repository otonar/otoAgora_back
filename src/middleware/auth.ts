import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';

type AuthContext = Context<{ Bindings: Bindings; Variables: Variables }>;

export function requireAuth(c: AuthContext): { userId: string; username: string } | null {
  const userId = c.get('userId');
  if (!userId) return null;
  return { userId, username: c.get('username') };
}
