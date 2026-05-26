import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { getDb } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

const RegisterBody = z.object({
  username: z.string().min(3).max(32),
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

const TokenResponse = z.object({
  token: z.string(),
  user: z.object({ id: z.string(), username: z.string(), email: z.string() }),
});

const ErrorResponse = z.object({ error: z.string() });

app.openapi(
  createRoute({
    method: 'post',
    path: '/register',
    tags: ['Auth'],
    summary: 'ユーザー登録',
    request: { body: { content: { 'application/json': { schema: RegisterBody } } } },
    responses: {
      201: { content: { 'application/json': { schema: TokenResponse } }, description: '登録成功' },
      409: { content: { 'application/json': { schema: ErrorResponse } }, description: 'メール重複' },
    },
  }),
  async (c) => {
    const { username, email, password } = c.req.valid('json');
    const db = getDb(c.env.DATABASE_URL);

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) return c.json({ error: 'Email already in use' }, 409);

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(users).values({ username, email, passwordHash }).returning();

    const token = await sign({ sub: user.id, username: user.username }, c.env.JWT_SECRET);
    return c.json({ token, user: { id: user.id, username: user.username, email: user.email } }, 201);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/login',
    tags: ['Auth'],
    summary: 'ログイン',
    request: { body: { content: { 'application/json': { schema: LoginBody } } } },
    responses: {
      200: { content: { 'application/json': { schema: TokenResponse } }, description: 'ログイン成功' },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '認証失敗' },
    },
  }),
  async (c) => {
    const { email, password } = c.req.valid('json');
    const db = getDb(c.env.DATABASE_URL);

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const token = await sign({ sub: user.id, username: user.username }, c.env.JWT_SECRET);
    return c.json({ token, user: { id: user.id, username: user.username, email: user.email } }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    tags: ['Auth'],
    summary: '現在のユーザー情報',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        content: { 'application/json': { schema: z.object({ id: z.string(), username: z.string() }) } },
        description: 'ユーザー情報',
      },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '未認証' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return c.json({ id: user.userId, username: user.username }, 200);
  },
);

export { app as authRoutes };
