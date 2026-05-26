# 技術選定理由書

## 1. ランタイム: Cloudflare Workers

### 選定理由

| 比較対象 | Cloudflare Workers | AWS Lambda | Vercel Serverless |
|---------|-------------------|-----------|------------------|
| 実行環境 | V8 Isolate (エッジ) | Node.js (リージョン) | Node.js (リージョン) |
| コールドスタート | **なし** | 数百ms〜数秒 | 数百ms |
| 無料枠 | **1日10万req** | 1ヶ月100万req | 1ヶ月100万req |
| レイテンシ | **最小（ユーザー近傍）** | リージョン依存 | リージョン依存 |
| Node.js互換 | 限定的 | 完全 | 完全 |

**採用決定の理由:**
- コールドスタートがないため、デモ時に常に高速なレスポンスを示せる
- エッジ実行はモダンなWeb開発のトレンドであり、技術的な先進性をアピールできる
- V8 Isolateベースのため、Node.js非互換の制約があるが、その制約への対応（Web Crypto APIの採用など）が設計の深さを示す

### トレードオフ

- Node.jsのエコシステム（bcryptなど）が使えない → Web Crypto API で代替
- 実行時間の上限（CPU時間30ms）→ 重い処理には向かないが、APIとして十分

---

## 2. フレームワーク: Hono

### 選定理由

| 比較対象 | Hono | Express | Fastify | Elysia |
|---------|------|---------|---------|--------|
| Workers対応 | **◎** | △（非推奨） | △ | ◎（Bun向け） |
| TypeScript | **ファーストクラス** | 後付け | 後付け | ファーストクラス |
| OpenAPI統合 | **@hono/zod-openapi** | 手動 | fastify-swagger | 手動 |
| バンドルサイズ | **極小** | 中 | 中 | 小 |
| 日本語情報 | **多い（日本製）** | 多い | 少ない | 少ない |

**採用決定の理由:**
- Cloudflare Workers向けに最適化された唯一の主要フレームワーク
- `@hono/zod-openapi` により、**型定義・バリデーション・ドキュメントを一元管理**できる
- 日本発のOSSであり、国内採用事例が急増している（2024年〜）

### Expressを選ばなかった理由

Expressは成熟したフレームワークだが、Cloudflare Workers上での動作は非推奨。TypeScriptのサポートも後付けで型安全性が低い。ポートフォリオとして「枯れた技術」より「モダンで適切な技術選択」を示したかった。

---

## 3. データベース: Neon (PostgreSQL)

### 選定理由

| 比較対象 | Neon | PlanetScale | Supabase | Railway |
|---------|------|-------------|---------|---------|
| エンジン | **PostgreSQL** | MySQL | PostgreSQL | PostgreSQL |
| サーバーレス対応 | **◎（WebSocket）** | ◎（HTTP） | ◎ | △ |
| Workers対応 | **◎** | ◎ | ◎ | △ |
| 無料枠 | **0.5GB** | 5GB | 500MB | 有料のみ |
| ブランチ機能 | **◎** | ◎ | △ | △ |

**採用決定の理由:**
- `@neondatabase/serverless` ドライバーがWebSocketベースでCloudflare Workersに対応
- PostgreSQLを採用することでMySQLより豊富な型・制約を使える
- ブランチ機能により開発・本番環境を分離できる設計が可能

### MySQLを選ばなかった理由

PostgreSQLの方が`ENUM`型、`UUID`型のサポートが充実しており、今回の`targetType`のような列挙型を自然に表現できる。また業務システムではPostgreSQLの採用が多く、学習価値が高い。

---

## 4. ORM: Drizzle ORM

### 選定理由

| 比較対象 | Drizzle ORM | Prisma | Kysely |
|---------|-------------|--------|--------|
| Workers対応 | **◎** | △（エンジン不要版あり） | ◎ |
| 型安全性 | **◎** | ◎ | ◎ |
| バンドルサイズ | **小** | 大（エンジン含む） | 小 |
| マイグレーション | **drizzle-kit** | prisma migrate | 手動 |
| 学習コスト | 中 | **低** | 高 |

**採用決定の理由:**
- Prismaのエンジンバイナリ（約40MB）はCloudflare Workersに持ち込めない
- Drizzle ORMはSQLに近い記法で、**ORMの抽象化を理解しながら使える**
- `drizzle-kit push` で手軽にスキーマを同期でき、開発速度が高い

---

## 5. 認証: JWT (hono/jwt)

### 選定理由

| 比較対象 | JWT | セッション | OAuth |
|---------|-----|----------|-------|
| ステートレス | **◎** | × | ◎ |
| エッジ対応 | **◎** | △（KV必要） | ◎ |
| 実装コスト | **低** | 中 | 高 |
| セキュリティ | 中（適切に実装すれば十分） | 高 | 高 |

**採用決定の理由:**
- Cloudflare Workersはステートレスな実行環境のため、サーバーサイドセッションを持てない
- JWTはエッジで完結して検証できるため、DBアクセスなしに認証できる
- ポートフォリオとして認証の仕組みを自前実装することで、理解の深さをアピールできる

### パスワードハッシュ: PBKDF2 (Web Crypto API)

bcryptはNode.jsネイティブモジュールのためWorkersで使用不可。代替として **Web Crypto API の PBKDF2** を採用。

- 反復回数: 100,000回（NIST推奨）
- ハッシュ関数: SHA-256
- ソルト: 128bit ランダム

これはNode.js環境のbcryptと同等以上のセキュリティ強度を持つ。

---

## 6. フロントエンド: Next.js 15 (App Router)

### 選定理由

| 比較対象 | Next.js | Nuxt | SvelteKit | Remix |
|---------|---------|------|-----------|-------|
| Reactエコシステム | **◎** | △（Vue） | △ | ◎ |
| App Router (RSC) | **◎** | ○（Nitro） | ○ | △ |
| Vercel最適化 | **◎** | ○ | ○ | ○ |
| 採用需要（国内） | **◎** | ○ | △ | △ |
| 学習リソース | **◎** | ○ | ○ | ○ |

**採用決定の理由:**
- 国内の求人でReact/Next.jsの需要が最も高い
- App RouterのReact Server Components (RSC) は2024年以降の主流
- Vercelとの統合が最良でデプロイが最もシンプル

---

## 7. 状態管理: Zustand

### 選定理由

| 比較対象 | Zustand | Redux Toolkit | Jotai | Context API |
|---------|---------|---------------|-------|-------------|
| バンドルサイズ | **極小（2KB）** | 中（16KB） | 小（3KB） | 0 |
| 学習コスト | **低** | 高 | 低 | 低 |
| localStorage永続化 | **middleware1行** | 手動 | 要ライブラリ | 手動 |
| DevTools対応 | ◎ | **◎** | ○ | △ |

**採用決定の理由:**
- JWT認証トークンのlocalStorage永続化が `persist` ミドルウェア1行で実現できる
- 認証状態という単一の用途に対してRedux Toolkitは過剰
- App Routerとの相性がよく、`'use client'` 境界を意識した設計がしやすい
