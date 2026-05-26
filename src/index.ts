import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { verify } from 'hono/jwt';
import { authRoutes } from './routes/auth';
import { topicsRoutes } from './routes/topics';
import { thesesRoutes } from './routes/theses';
import { argumentsRoutes } from './routes/arguments';
import { perspectivesRoutes } from './routes/perspectives';
import { feedRoutes } from './routes/feed';
import type { Bindings, Variables } from './types';

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', cors());

// Bearer トークンがあればペイロードを変数にセット（エラーは無視）
app.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = await verify(auth.slice(7), c.env.JWT_SECRET, 'HS256');
      c.set('userId', payload.sub as string);
      c.set('username', payload.username as string);
    } catch {}
  }
  await next();
});

app.route('/auth', authRoutes);
app.route('/topics', topicsRoutes);
app.route('/theses', thesesRoutes);
app.route('/arguments', argumentsRoutes);
app.route('/perspectives', perspectivesRoutes);
app.route('/feed', feedRoutes);

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Agora API',
    version: '1.0.0',
    description: '人ではなく思想・主張に同意・フォローする議論ベースSNS',
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
} as Parameters<typeof app.doc>[1]);

app.get('/docs', swaggerUI({ url: '/openapi.json' }));
app.get('/', (c) => c.json({ name: 'Agora API', docs: '/docs' }));

export default app;
