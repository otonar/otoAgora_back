# otoAgora API

> 人ではなく「思想・主張」に同意・フォローする、議論ベースSNSのバックエンドAPI

**デモ:** https://agora-api.otoagora.workers.dev/docs

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [README.md](README.md) | プロジェクト概要・セットアップ・API一覧 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | システム構成図・設計判断の根拠 |
| [TECH_DECISIONS.md](TECH_DECISIONS.md) | 技術選定理由・比較表 |
| [COMPARISON.md](COMPARISON.md) | 類似サービスとの比較・差別化ポイント |

---

## 背景・課題

InstagramなどビジュアルSNSの普及により、テキストと論理による議論の場が失われつつある。
既存SNSは「人」をフォローする設計だが、それはバズや人気者への同調圧力を生む。

**otoAgoraは「思想・立場」をフォローする**設計を採用することで、アイデアの質そのもので評価される議論空間を実現する。

---

## 技術スタック

| 役割 | 技術 | 採用理由 |
|------|------|---------|
| ランタイム | Cloudflare Workers | エッジ実行、低レイテンシ、無料枠が充実 |
| フレームワーク | Hono (TypeScript) | 日本製、軽量、型安全、OpenAPI対応 |
| データベース | PostgreSQL (Neon) | サーバーレスPostgres、ブランチ機能 |
| ORM | Drizzle ORM | 型安全、マイグレーション管理、軽量 |
| 認証 | JWT (hono/jwt) | ステートレス、エッジ環境と相性良し |
| パスワードハッシュ | Web Crypto API (PBKDF2) | Node.js非依存、Workers対応 |
| APIドキュメント | OpenAPI + Swagger UI | @hono/zod-openapiで自動生成 |

---

## データモデル

```
users
  └─ topics（議題）
       └─ theses（主張）
            └─ arguments（論拠 / 反論）

perspectives（思想・立場）
  ├─ perspective_follows（ユーザーが思想をフォロー）
  └─ theses.perspectiveId（主張が思想に紐づく）

endorsements（主張・論拠への同意）
  ├─ targetType: THESIS | ARGUMENT
  └─ targetId: uuid
```

### 設計上のポイント

- **endorsements テーブルで多態性を実現** — 主張と論拠の両方への同意を1テーブルで管理（`targetType` + `targetId`）
- **思想フォローによるフィード生成** — ユーザーフォローなし。フォローした思想に紐づく主張のみフィードに流れる
- **arguments の自己参照** — `parentId` で入れ子の議論（返信）を表現

---

## APIエンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| POST | /auth/register | ユーザー登録 | 不要 |
| POST | /auth/login | ログイン | 不要 |
| GET | /auth/me | 自分の情報 | 必要 |
| GET | /topics | 議題一覧 | 不要 |
| POST | /topics | 議題作成 | 必要 |
| GET | /topics/:id | 議題詳細 | 不要 |
| GET | /theses | 主張一覧（topicIdでフィルタ） | 不要 |
| POST | /theses | 主張投稿 | 必要 |
| POST | /theses/:id/endorse | 主張に同意 | 必要 |
| DELETE | /theses/:id/endorse | 同意取り消し | 必要 |
| GET | /arguments | 論拠一覧（thesisIdでフィルタ） | 不要 |
| POST | /arguments | 論拠投稿 | 必要 |
| POST | /arguments/:id/endorse | 論拠に同意 | 必要 |
| GET | /perspectives | 思想一覧 | 不要 |
| POST | /perspectives | 思想作成 | 必要 |
| POST | /perspectives/:id/follow | 思想をフォロー | 必要 |
| DELETE | /perspectives/:id/follow | フォロー解除 | 必要 |
| GET | /feed | フィード（フォロー中の思想の主張） | 必要 |

---

## ローカル開発

### 必要なもの

- Node.js 18+
- Cloudflare アカウント
- Neon アカウント（PostgreSQL）

### セットアップ

```bash
git clone <this-repo>
cd otoGame
npm install
```

`.env` ファイルを作成:

```env
DATABASE_URL=postgresql://...（Neonの接続文字列）
JWT_SECRET=（ランダムな長い文字列）
```

DBのテーブルを作成:

```bash
npm run db:push
```

ローカルサーバー起動:

```bash
npm run dev
```

http://localhost:8787/docs でSwagger UIが開く。

### 主要コマンド

```bash
npm run dev        # ローカル開発サーバー
npm run deploy     # Cloudflare Workersにデプロイ
npm run db:push    # DBスキーマを同期
npm run db:studio  # Drizzle Studio（DBのGUI）
npm run typecheck  # TypeScript型チェック
```

---

## デプロイ

```bash
# Cloudflareにログイン
npx wrangler login

# シークレットを設定
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET

# デプロイ
npm run deploy
```

---

## セキュリティ

- パスワードは PBKDF2（100,000回反復）でハッシュ化
- JWT はHS256署名、`Authorization: Bearer <token>` ヘッダーで検証
- endorsements テーブルに UNIQUE 制約で二重同意を防止
- `.env` は `.gitignore` と `.claude/settings.json` で除外済み
