# 技術設計書 - AI記事収集Discord通知Bot

## 1. システム概要

TypeScriptで実装されるAI記事収集Discord通知Botは、GitHub Actionsで日次実行され、複数のIT技術サイトからAI関連記事を収集し、Discordに通知する。

## 2. アーキテクチャ設計

### 2.1 システム構成図

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub        │    │   Article       │    │   Discord       │
│   Actions       │───▶│   Collector     │───▶│   Notifier      │
│   (Scheduler)   │    │   Service       │    │   Service       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Data Sources  │
                       │   - Qiita API   │
                       │   - Zenn RSS    │
                       │   - HackerNews  │
                       │   - Dev.to API  │
                       └─────────────────┘
```

### 2.2 ディレクトリ構造

```
ai-bot2/
├── src/
│   ├── services/
│   │   ├── ArticleCollectorService.ts
│   │   ├── DiscordNotifierService.ts
│   │   └── index.ts
│   ├── collectors/
│   │   ├── QiitaCollector.ts
│   │   ├── ZennCollector.ts
│   │   ├── HackerNewsCollector.ts
│   │   └── DevToCollector.ts
│   ├── types/
│   │   └── Article.ts
│   ├── utils/
│   │   ├── deduplication.ts
│   │   ├── filtering.ts
│   │   └── logger.ts
│   └── main.ts
├── .github/
│   └── workflows/
│       └── daily-collection.yml
├── config/
│   └── keywords.json
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

## 3. データ設計

### 3.1 記事データ型

```typescript
interface Article {
  id: string;
  title: string;
  url: string;
  author: string;
  publishedAt: Date;
  source: 'qiita' | 'zenn' | 'hackernews' | 'devto';
  tags: string[];
  excerpt?: string;
  score?: number;
  relevanceScore: number;
}

interface CollectionResult {
  articles: Article[];
  errors: CollectionError[];
  timestamp: Date;
}

interface CollectionError {
  source: string;
  error: string;
  timestamp: Date;
}
```

### 3.2 設定データ型

```typescript
interface Config {
  keywords: string[];
  sources: {
    qiita: {
      enabled: boolean;
      tags: string[];
    };
    zenn: {
      enabled: boolean;
      topics: string[];
    };
    hackernews: {
      enabled: boolean;
      searchTerms: string[];
    };
    devto: {
      enabled: boolean;
      tags: string[];
    };
  };
  discord: {
    webhookUrl: string;
    channelId: string;
  };
  filtering: {
    minRelevanceScore: number;
    maxArticlesPerDay: number;
  };
}
```

## 4. API設計

### 4.1 データ収集API

#### QiitaCollector
```typescript
class QiitaCollector {
  async collectArticles(tags: string[], since?: Date): Promise<Article[]>
  private async fetchFromQiitaAPI(tag: string, page: number): Promise<QiitaArticle[]>
  private transformToArticle(qiitaArticle: QiitaArticle): Article
}
```

#### ZennCollector  
```typescript
class ZennCollector {
  async collectArticles(topics: string[], since?: Date): Promise<Article[]>
  private async fetchFromZennRSS(topic: string): Promise<Article[]>
  private parseRSSFeed(xmlContent: string): Article[]
}
```

#### HackerNewsCollector
```typescript
class HackerNewsCollector {
  async collectArticles(searchTerms: string[], since?: Date): Promise<Article[]>
  private async searchHackerNews(term: string): Promise<Article[]>
  private async getStoryDetails(storyId: number): Promise<Article>
}
```

#### DevToCollector
```typescript
class DevToCollector {
  async collectArticles(tags: string[], since?: Date): Promise<Article[]>
  private async fetchFromDevToAPI(tag: string, page: number): Promise<DevToArticle[]>
  private transformToArticle(devtoArticle: DevToArticle): Article
}
```

### 4.2 メインサービス

#### ArticleCollectorService
```typescript
class ArticleCollectorService {
  constructor(config: Config)
  async collectAllArticles(): Promise<CollectionResult>
  private async collectFromSource(source: string): Promise<Article[]>
  private filterArticles(articles: Article[]): Article[]
  private deduplicateArticles(articles: Article[]): Article[]
  private calculateRelevanceScore(article: Article): number
}
```

#### DiscordNotifierService
```typescript
class DiscordNotifierService {
  constructor(webhookUrl: string)
  async sendArticleNotification(articles: Article[]): Promise<void>
  private formatArticleMessage(article: Article): DiscordEmbed
  private createSummaryMessage(articleCount: number): string
}
```

## 5. 外部サービス連携

### 5.1 API仕様

#### Qiita API v2
- **エンドポイント**: `https://qiita.com/api/v2/items`
- **認証**: 不要（レート制限あり）
- **パラメータ**: `tags`, `created`, `per_page`, `page`

#### Zenn RSS
- **エンドポイント**: `https://zenn.dev/topics/{topic}/feed`
- **形式**: RSS 2.0
- **フィルタリング**: 日付とキーワードベース

#### Hacker News API
- **エンドポイント**: `https://hn.algolia.com/api/v1/search`
- **パラメータ**: `query`, `tags`, `created_at`

#### Dev.to API
- **エンドポイント**: `https://dev.to/api/articles`
- **認証**: 不要
- **パラメータ**: `tag`, `top`, `per_page`, `page`

### 5.2 Discord Webhook
- **形式**: JSON payload with embeds
- **制限**: 10 embeds per message, 6000 characters per embed

## 6. GitHub Actions設計

### 6.1 ワークフロー設定

```yaml
name: Daily Article Collection
on:
  schedule:
    - cron: '0 0 * * *'  # UTC 0:00 (JST 9:00)
  workflow_dispatch:

jobs:
  collect-and-notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run collect
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

### 6.2 環境変数・シークレット

- `DISCORD_WEBHOOK_URL`: Discord Webhook URL
- `QIITA_ACCESS_TOKEN`: (オプション) レート制限緩和用
- `DEVTO_API_KEY`: (オプション) Dev.to API利用拡張用

## 7. エラーハンドリング・ログ設計

### 7.1 エラーカテゴリ

1. **ネットワークエラー**: API接続失敗、タイムアウト
2. **データパースエラー**: JSON/XML解析失敗
3. **レート制限エラー**: API利用制限到達
4. **Discord送信エラー**: Webhook送信失敗

### 7.2 ログレベル

- **INFO**: 正常実行、記事収集数
- **WARN**: 一部ソース失敗、フィルタリング適用
- **ERROR**: 致命的エラー、全体処理停止

### 7.3 リトライ戦略

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  backoffMultiplier: number;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig
): Promise<T>
```

## 8. パフォーマンス設計

### 8.1 実行時間最適化

- 並列API呼び出し（Promise.allSettled使用）
- 適切なページネーション
- キャッシュ活用（重複チェック高速化）

### 8.2 メモリ効率

- ストリーム処理（大量データ対応）
- 適切なデータ構造選択
- 不要オブジェクトの早期解放

## 9. セキュリティ設計

### 9.1 機密情報管理

- GitHub Secretsでのトークン管理
- 環境変数での設定注入
- ログでの機密情報マスキング

### 9.2 入力検証

- URLバリデーション
- HTMLサニタイゼーション
- レート制限遵守

## 10. 拡張性考慮

### 10.1 新規ソース追加

```typescript
interface ArticleCollector {
  collectArticles(params: CollectionParams): Promise<Article[]>;
}
```

### 10.2 通知チャンネル拡張

```typescript
interface NotificationService {
  sendNotification(articles: Article[]): Promise<void>;
}
```

## 11. 設定ファイル

### 11.1 keywords.json
```json
{
  "keywords": [
    "ChatGPT", "claude", "gemini", "LLM", "GPT","自然言語処理", "NotebookLM", "AI", "人工知能", "機械学習",
  ],
  "sources": {
    "qiita": {
      "enabled": true,
      "tags": ["ChatGPT", "Claude", "ClaudeCode", "Gemini", "LLM", "GPT","自然言語処理", "NotebookLM", "AI", "人工知能", "機械学習",]
    },
    "zenn": {
      "enabled": true,
      "topics": ["ChatGPT", "Claude", "Claude Code", "Gemini", "LLM", "GPT","自然言語処理", "NotebookLM", "AI", "人工知能", "機械学習",]
    },
    "hackernews": {
      "enabled": true,
      "searchTerms": ["ChatGPT", "claude", "gemini", "LLM", "GPT", "NotebookLM", "AI"]
    },
    "devto": {
      "enabled": true,
      "tags": ["chatgpt", "claude", "claudecode", "gemini", "llm", "gpt", "notebooklm", "ai"]
    }
  },
  "discord": {
    "maxArticlesPerBatch": 10,
    "embedColor": "#00ff00"
  },
  "filtering": {
    "minRelevanceScore": 0.6,
    "maxArticlesPerDay": 50,
    "excludeKeywords": ["広告", "PR", "sponsored"]
  }
}
```