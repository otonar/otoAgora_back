import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { topics, theses } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

const TopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  thesesCount: z.number().optional(),
});

const ErrorResponse = z.object({ error: z.string() });

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Topics'],
    summary: '議題一覧',
    responses: {
      200: { content: { 'application/json': { schema: z.object({ topics: z.array(TopicSchema) }) } }, description: '一覧' },
    },
  }),
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const rows = await db
      .select({
        id: topics.id,
        title: topics.title,
        description: topics.description,
        createdBy: topics.createdBy,
        createdAt: topics.createdAt,
        thesesCount: sql<number>`count(${theses.id})::int`,
      })
      .from(topics)
      .leftJoin(theses, eq(theses.topicId, topics.id))
      .groupBy(topics.id)
      .orderBy(topics.createdAt);

    return c.json({ topics: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Topics'],
    summary: '議題作成',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ title: z.string().min(5).max(100), description: z.string().min(10).max(500) }),
          },
        },
      },
    },
    responses: {
      201: { content: { 'application/json': { schema: TopicSchema } }, description: '作成成功' },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '未認証' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { title, description } = c.req.valid('json');
    const db = getDb(c.env.DATABASE_URL);
    const [topic] = await db
      .insert(topics)
      .values({ title, description, createdBy: user.userId })
      .returning();
    return c.json({ ...topic, createdAt: topic.createdAt.toISOString() }, 201);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Topics'],
    summary: '議題詳細',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { content: { 'application/json': { schema: TopicSchema } }, description: '詳細' },
      404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = getDb(c.env.DATABASE_URL);
    const [topic] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
    if (!topic) return c.json({ error: 'Topic not found' }, 404);
    return c.json({ ...topic, createdAt: topic.createdAt.toISOString() }, 200);
  },
);

export { app as topicsRoutes };
