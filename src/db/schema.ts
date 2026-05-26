import { pgTable, uuid, text, timestamp, pgEnum, unique } from 'drizzle-orm/pg-core';

export const stanceEnum = pgEnum('stance', ['SUPPORT', 'OPPOSE', 'NEUTRAL']);
export const targetTypeEnum = pgEnum('target_type', ['THESIS', 'ARGUMENT']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const topics = pgTable('topics', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 思想的立場（例: 功利主義, リベラリズム）— フォロー対象はユーザーではなくこれ
export const perspectives = pgTable('perspectives', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 議題に対する主張
export const theses = pgTable('theses', {
  id: uuid('id').defaultRandom().primaryKey(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id),
  perspectiveId: uuid('perspective_id').references(() => perspectives.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 主張への反論・賛成論
export const dbArguments = pgTable('arguments', {
  id: uuid('id').defaultRandom().primaryKey(),
  thesisId: uuid('thesis_id').notNull().references(() => theses.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'), // 自己参照 — ネスト議論
  authorId: uuid('author_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  stance: stanceEnum('stance').notNull().default('NEUTRAL'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 主張・論拠への同意（人ではなく論点に対していいね）
export const endorsements = pgTable('endorsements', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  targetType: targetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.userId, t.targetType, t.targetId),
}));

// 思想へのフォロー（ユーザーではなく思想をフォロー）
export const perspectiveFollows = pgTable('perspective_follows', {
  userId: uuid('user_id').notNull().references(() => users.id),
  perspectiveId: uuid('perspective_id').notNull().references(() => perspectives.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.userId, t.perspectiveId),
}));
