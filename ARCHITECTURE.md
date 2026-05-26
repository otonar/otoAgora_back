# アーキテクチャ設計書

## システム構成

```
┌─────────────────────────────────────────────────────┐
│                    クライアント                        │
│         Next.js (Vercel) / Swagger UI               │
└─────────────────────┬───────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────┐
│              Cloudflare Workers (Edge)               │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │   Hono   │  │  JWT検証  │  │  OpenAPI / Docs  │  │
│  │  Router  │→ │Middleware│→ │  Swagger UI      │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                      │                              │
│          ┌───────────┼───────────┐                  │
│          ▼           ▼           ▼                  │
│      /auth       /topics    /perspectives            │
│      /theses     /arguments /feed                   │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket (Neon serverless driver)
                       ▼
┌─────────────────────────────────────────────────────┐
│                Neon PostgreSQL                       │
│                                                     │
│  users → topics → theses → arguments               │
│               ↘        ↗                           │
│            perspectives                             │
│          perspective_follows                        │
│              endorsements                           │
└─────────────────────────────────────────────────────┘
```

## 主要な設計判断

### 1. Cloudflare Workers を選んだ理由

- **エッジ実行**: ユーザーに近いDCで実行されるため低レイテンシ
- **コールドスタートなし**: Isolateベースで常時起動
- **無料枠**: 1日10万リクエスト無料
- **将来性**: エッジコンピューティングのデファクトスタンダード

### 2. Hono を選んだ理由

- **軽量**: Cloudflare Workers の制限（1MB）に適合
- **型安全**: `@hono/zod-openapi` でリクエスト/レスポンスの型が保証される
- **OpenAPI自動生成**: ルート定義からSwagger UIを自動生成
- **日本製**: 国内の採用事例が増加中

### 3. Neon + Drizzle を選んだ理由

- **Neon**: サーバーレスPostgres。WebSocketドライバーがEdge環境に対応
- **Drizzle**: TypeScriptファーストなORM。型安全なクエリビルダー
- **軽量**: Prismaと異なりエンジン不要、Workersで動作する

### 4. 「思想フォロー」の実装方針

従来SNSとの違い:

```
従来SNS:  user_follows (follower_id → following_id)
otoAgora: perspective_follows (user_id → perspective_id)
```

フィード生成クエリ:
```sql
SELECT theses.*
FROM theses
JOIN perspective_follows ON theses.perspective_id = perspective_follows.perspective_id
WHERE perspective_follows.user_id = :userId
ORDER BY theses.created_at DESC
LIMIT 50;
```

### 5. 同意（Endorse）の多態設計

主張（Thesis）と論拠（Argument）の両方に同意できるが、テーブルを分けず `targetType` で区別:

```sql
endorsements (
  user_id     UUID,
  target_type ENUM('THESIS', 'ARGUMENT'),
  target_id   UUID,
  UNIQUE(user_id, target_type, target_id)  -- 二重同意防止
)
```

テーブルを増やさず、UNIQUE制約で冪等性を保証している。

### 6. 認証フロー

```
1. POST /auth/login → パスワードをPBKDF2で検証
2. JWT発行: { sub: userId, username }
3. 以降のリクエスト: Authorization: Bearer <token>
4. Workersのグローバルミドルウェアでverify()
5. c.set('userId', ...) でハンドラーに引き渡す
```

Cloudflare WorkersにはNode.jsのbcryptが使えないため、Web Crypto API（PBKDF2）でパスワードをハッシュ化している。

## ディレクトリ構成

```
src/
├── index.ts              # エントリーポイント、ルート登録、OpenAPI定義
├── types.ts              # Bindings / Variables の型定義
├── db/
│   ├── schema.ts         # Drizzle スキーマ（テーブル定義）
│   └── index.ts          # DBクライアント生成
├── lib/
│   └── crypto.ts         # PBKDF2パスワードハッシュ
├── middleware/
│   └── auth.ts           # 認証ガード（requireAuth関数）
└── routes/
    ├── auth.ts           # /auth/*
    ├── topics.ts         # /topics/*
    ├── theses.ts         # /theses/*
    ├── arguments.ts      # /arguments/*
    ├── perspectives.ts   # /perspectives/*
    └── feed.ts           # /feed
```

## 今後の拡張案

- [ ] ページネーション（cursor-based）
- [ ] 全文検索（Cloudflare AI / PostgreSQL FTS）
- [ ] WebSocketによるリアルタイム通知
- [ ] レート制限（Cloudflare Workers KV）
- [ ] テスト（Vitest + Miniflare）
