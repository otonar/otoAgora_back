import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { theses, perspectiveFollows, endorsements, topics, perspectives } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

const FeedItemSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  topicTitle: z.string(),
  authorId: z.string(),
  perspectiveId: z.string().nullable(),
  perspectiveName: z.string().nullable(),
  content: z.string(),
  createdAt: z.string(),
  endorseCount: z.number(),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Feed'],
    summary: 'フォロー中の思想に基づくフィード',
    description: 'ユーザーがフォローしている思想に紐づいた主張を新着順で返す。ユーザーではなく思想をフォローすることでフィードが構成される。',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { content: { 'application/json': { schema: z.object({ feed: z.array(FeedItemSchema) }) } }, description: 'フィード' },
      401: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: '未認証' },
    },
  }),
  async (c) => {
    const user = requireAuth(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const db = getDb(c.env.DATABASE_URL);

    const followed = await db
      .select({ perspectiveId: perspectiveFollows.perspectiveId })
      .from(perspectiveFollows)
      .where(eq(perspectiveFollows.userId, user.userId));

    if (followed.length === 0) return c.json({ feed: [] }, 200);

    const perspectiveIds = followed.map(f => f.perspectiveId);

    const rows = await db
      .select({
        id: theses.id,
        topicId: theses.topicId,
        topicTitle: topics.title,
        authorId: theses.authorId,
        perspectiveId: theses.perspectiveId,
        perspectiveName: perspectives.name,
        content: theses.content,
        createdAt: theses.createdAt,
        endorseCount: sql<number>`count(${endorsements.id})::int`,
      })
      .from(theses)
      .innerJoin(topics, eq(topics.id, theses.topicId))
      .leftJoin(perspectives, eq(perspectives.id, theses.perspectiveId))
      .leftJoin(endorsements, and(eq(endorsements.targetId, theses.id), eq(endorsements.targetType, 'THESIS')))
      .where(inArray(theses.perspectiveId, perspectiveIds))
      .groupBy(theses.id, topics.title, perspectives.name)
      .orderBy(desc(theses.createdAt))
      .limit(50);

    return c.json({ feed: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) }, 200);
  },
);

export { app as feedRoutes };
