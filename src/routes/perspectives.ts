import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { perspectives, perspectiveFollows, theses } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

const PerspectiveSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  followerCount: z.number().optional(),
  thesesCount: z.number().optional(),
});

const ErrorResponse = z.object({ error: z.string() });

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Perspectives'],
    summary: '思想・立場の一覧',
    responses: {
      200: { content: { 'application/json': { schema: z.object({ perspectives: z.array(PerspectiveSchema) }) } }, description: '一覧' },
    },
  }),
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const rows = await db
      .select({
        id: perspectives.id,
        name: perspectives.name,
        description: perspectives.description,
        createdBy: perspectives.createdBy,
        createdAt: perspectives.createdAt,
        followerCount: sql<number>`count(distinct ${perspectiveFollows.userId})::int`,
        thesesCount: sql<number>`count(distinct ${theses.id})::int`,
      })
      .from(perspectives)
      .leftJoin(perspectiveFollows, eq(perspectiveFollows.perspectiveId, perspectives.id))
      .leftJoin(theses, eq(theses.perspectiveId, perspectives.id))
      .groupBy(perspectives.id)
      .orderBy(perspectives.createdAt);

    return c.json({ perspectives: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Perspectives'],
    summary: '思想・立場を作成する',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ name: z.string().min(2).max(50), description: z.string().min(10).max(500) }),
          },
        },
      },
    },
    responses: {
      201: { content: { 'application/json': { schema: PerspectiveSchema } }, description: '作成成功' },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '未認証' },
      409: { content: { 'application/json': { schema: ErrorResponse } }, description: '名前重複' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { name, description } = c.req.valid('json');
    const db = getDb(c.env.DATABASE_URL);

    const existing = await db.select().from(perspectives).where(eq(perspectives.name, name)).limit(1);
    if (existing.length > 0) return c.json({ error: 'Perspective name already exists' }, 409);

    const [perspective] = await db
      .insert(perspectives)
      .values({ name, description, createdBy: user.userId })
      .returning();

    return c.json({ ...perspective, createdAt: perspective.createdAt.toISOString() }, 201);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/:id/follow',
    tags: ['Perspectives'],
    summary: '思想をフォローする（ユーザーではなく思想をフォロー）',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      201: { content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } }, description: 'フォロー成功' },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '未認証' },
      404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
      409: { content: { 'application/json': { schema: ErrorResponse } }, description: '既にフォロー済み' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { id } = c.req.valid('param');
    const db = getDb(c.env.DATABASE_URL);

    const [p] = await db.select().from(perspectives).where(eq(perspectives.id, id)).limit(1);
    if (!p) return c.json({ error: 'Perspective not found' }, 404);

    try {
      await db.insert(perspectiveFollows).values({ userId: user.userId, perspectiveId: id });
      return c.json({ ok: true }, 201);
    } catch {
      return c.json({ error: 'Already following' }, 409);
    }
  },
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/:id/follow',
    tags: ['Perspectives'],
    summary: '思想のフォローを解除する',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } }, description: 'フォロー解除成功' },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '未認証' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { id } = c.req.valid('param');
    const db = getDb(c.env.DATABASE_URL);
    await db.delete(perspectiveFollows).where(
      and(eq(perspectiveFollows.userId, user.userId), eq(perspectiveFollows.perspectiveId, id)),
    );
    return c.json({ ok: true }, 200);
  },
);

export { app as perspectivesRoutes };
