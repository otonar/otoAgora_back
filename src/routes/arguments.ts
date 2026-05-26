import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { dbArguments, endorsements, theses } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

const StanceEnum = z.enum(['SUPPORT', 'OPPOSE', 'NEUTRAL']);

const ArgumentSchema = z.object({
  id: z.string(),
  thesisId: z.string(),
  parentId: z.string().nullable(),
  authorId: z.string(),
  content: z.string(),
  stance: StanceEnum,
  createdAt: z.string(),
  endorseCount: z.number().optional(),
});

const ErrorResponse = z.object({ error: z.string() });

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Arguments'],
    summary: '論拠一覧（thesisId 必須）',
    request: { query: z.object({ thesisId: z.string().uuid() }) },
    responses: {
      200: { content: { 'application/json': { schema: z.object({ arguments: z.array(ArgumentSchema) }) } }, description: '一覧' },
    },
  }),
  async (c) => {
    const { thesisId } = c.req.valid('query');
    const db = getDb(c.env.DATABASE_URL);

    const rows = await db
      .select({
        id: dbArguments.id,
        thesisId: dbArguments.thesisId,
        parentId: dbArguments.parentId,
        authorId: dbArguments.authorId,
        content: dbArguments.content,
        stance: dbArguments.stance,
        createdAt: dbArguments.createdAt,
        endorseCount: sql<number>`count(${endorsements.id})::int`,
      })
      .from(dbArguments)
      .leftJoin(endorsements, and(eq(endorsements.targetId, dbArguments.id), eq(endorsements.targetType, 'ARGUMENT')))
      .where(and(eq(dbArguments.thesisId, thesisId), isNull(dbArguments.parentId)))
      .groupBy(dbArguments.id)
      .orderBy(dbArguments.createdAt);

    return c.json({ arguments: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Arguments'],
    summary: '論拠を投稿する',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              thesisId: z.string().uuid(),
              parentId: z.string().uuid().optional(),
              content: z.string().min(10).max(2000),
              stance: StanceEnum.default('NEUTRAL'),
            }),
          },
        },
      },
    },
    responses: {
      201: { content: { 'application/json': { schema: ArgumentSchema } }, description: '投稿成功' },
      401: { content: { 'application/json': { schema: ErrorResponse } }, description: '未認証' },
      404: { content: { 'application/json': { schema: ErrorResponse } }, description: 'Not found' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { thesisId, parentId, content, stance } = c.req.valid('json');
    const db = getDb(c.env.DATABASE_URL);

    const [thesis] = await db.select().from(theses).where(eq(theses.id, thesisId)).limit(1);
    if (!thesis) return c.json({ error: 'Thesis not found' }, 404);

    const [arg] = await db
      .insert(dbArguments)
      .values({ thesisId, parentId: parentId ?? null, authorId: user.userId, content, stance })
      .returning();

    return c.json({ ...arg, createdAt: arg.createdAt.toISOString() }, 201);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/:id/endorse',
    tags: ['Arguments'],
    summary: '論拠に同意する',
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
      await db.insert(endorsements).values({ userId: user.userId, targetType: 'ARGUMENT', targetId: id });
      return c.json({ ok: true }, 201);
    } catch {
      return c.json({ error: 'Already endorsed' }, 409);
    }
  },
);

export { app as argumentsRoutes };
