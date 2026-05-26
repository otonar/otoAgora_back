import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { theses, endorsements, topics, perspectives } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

const ThesisSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  authorId: z.string(),
  perspectiveId: z.string().nullable(),
  content: z.string(),
  createdAt: z.string(),
  endorseCount: z.number().optional(),
});

const ErrorResponse = z.object({ error: z.string() });

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Theses'],
    summary: '主張一覧（topicId でフィルタ可）',
    request: { query: z.object({ topicId: z.string().uuid().optional() }) },
    responses: {
      200: { content: { 'application/json': { schema: z.object({ theses: z.array(ThesisSchema) }) } }, description: '一覧' },
    },
  }),
  async (c) => {
    const { topicId } = c.req.valid('query');
    const db = getDb(c.env.DATABASE_URL);

    const base = db
      .select({
        id: theses.id,
        topicId: theses.topicId,
        authorId: theses.authorId,
        perspectiveId: theses.perspectiveId,
        content: theses.content,
        createdAt: theses.createdAt,
        endorseCount: sql<number>`count(${endorsements.id})::int`,
      })
      .from(theses)
      .leftJoin(endorsements, and(eq(endorsements.targetId, theses.id), eq(endorsements.targetType, 'THESIS')))
      .groupBy(theses.id)
      .orderBy(theses.createdAt);

    const rows = topicId ? await base.where(eq(theses.topicId, topicId)) : await base;
    return c.json({ theses: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Theses'],
    summary: '主張を投稿する',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              topicId: z.string().uuid(),
              content: z.string().min(20).max(2000),
              perspectiveId: z.string().uuid().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { content: { 'application/json': { schema: ThesisSchema } }, description: '投稿成功' },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '未認証' },
      404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { topicId, content, perspectiveId } = c.req.valid('json');
    const db = getDb(c.env.DATABASE_URL);

    const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);
    if (!topic) return c.json({ error: 'Topic not found' }, 404);

    if (perspectiveId) {
      const [p] = await db.select().from(perspectives).where(eq(perspectives.id, perspectiveId)).limit(1);
      if (!p) return c.json({ error: 'Perspective not found' }, 404);
    }

    const [thesis] = await db
      .insert(theses)
      .values({ topicId, content, authorId: user.userId, perspectiveId: perspectiveId ?? null })
      .returning();

    return c.json({ ...thesis, createdAt: thesis.createdAt.toISOString() }, 201);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/:id/endorse',
    tags: ['Theses'],
    summary: '主張に同意する',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      201: { content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } }, description: '同意成功' },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '未認証' },
      409: { content: { 'application/json': { schema: ErrorResponse } }, description: '既に同意済み' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { id } = c.req.valid('param');
    const db = getDb(c.env.DATABASE_URL);
    try {
      await db.insert(endorsements).values({ userId: user.userId, targetType: 'THESIS', targetId: id });
      return c.json({ ok: true }, 201);
    } catch {
      return c.json({ error: 'Already endorsed' }, 409);
    }
  },
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/:id/endorse',
    tags: ['Theses'],
    summary: '同意を取り消す',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } }, description: '取り消し成功' },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '未認証' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { id } = c.req.valid('param');
    const db = getDb(c.env.DATABASE_URL);
    await db.delete(endorsements).where(
      and(eq(endorsements.userId, user.userId), eq(endorsements.targetType, 'THESIS'), eq(endorsements.targetId, id)),
    );
    return c.json({ ok: true }, 200);
  },
);

export { app as thesesRoutes };
