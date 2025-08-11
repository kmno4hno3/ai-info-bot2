# テスト設計書 - AI記事収集Discord通知Bot

## 1. テスト戦略

### 1.1 テストレベル

- **単体テスト**: 各コレクター、サービスクラスの個別機能
- **結合テスト**: サービス間連携、外部API統合
- **E2Eテスト**: 全体フロー（収集→フィルタ→通知）
- **GitHub Actions テスト**: ワークフロー動作確認

### 1.2 テスト方針

- **テストフレームワーク**: Jest
- **モック**: 外部API呼び出しのモック化
- **カバレッジ**: 80%以上を目標
- **CI/CD**: GitHub Actions でのテスト自動実行

## 2. 単体テスト設計

### 2.1 QiitaCollector テスト

#### テストケース

```typescript
describe('QiitaCollector', () => {
  describe('collectArticles', () => {
    it('正常なレスポンスで記事を正しく変換する', async () => {
      // Given: モックされたQiita APIレスポンス
      // When: collectArticles を呼び出す
      // Then: Article型に正しく変換される
    });

    it('API エラー時に適切にハンドリングする', async () => {
      // Given: API エラーレスポンス
      // When: collectArticles を呼び出す  
      // Then: エラーが適切にキャッチされる
    });

    it('空のレスポンスを適切に処理する', async () => {
      // Given: 空の配列レスポンス
      // When: collectArticles を呼び出す
      // Then: 空の配列が返される
    });

    it('レート制限に達した場合の処理', async () => {
      // Given: 429 レスポンス
      // When: collectArticles を呼び出す
      // Then: リトライ処理が実行される
    });

    it('不正なJSONレスポンスの処理', async () => {
      // Given: 不正なJSON
      // When: collectArticles を呼び出す
      // Then: パースエラーが適切に処理される
    });
  });

  describe('transformToArticle', () => {
    it('Qiita記事データを Article型に変換する', () => {
      // Given: Qiita記事オブジェクト
      // When: transformToArticle を呼び出す
      // Then: 適切なArticle型が返される
    });

    it('必須フィールドが欠けている場合のエラー処理', () => {
      // Given: 不完全なQiita記事データ
      // When: transformToArticle を呼び出す
      // Then: エラーがスローされる
    });
  });
});
```

### 2.2 ZennCollector テスト

```typescript
describe('ZennCollector', () => {
  describe('collectArticles', () => {
    it('RSS フィードを正しくパースする', async () => {
      // Given: モックされたRSSレスポンス
      // When: collectArticles を呼び出す
      // Then: Article配列が返される
    });

    it('不正なXMLの処理', async () => {
      // Given: 不正なXML
      // When: collectArticles を呼び出す
      // Then: エラーが適切に処理される
    });

    it('空のRSSフィードの処理', async () => {
      // Given: 空のRSSフィード
      // When: collectArticles を呼び出す
      // Then: 空の配列が返される
    });
  });

  describe('parseRSSFeed', () => {
    it('RSS XMLを Article配列に変換する', () => {
      // Given: 有効なRSS XML
      // When: parseRSSFeed を呼び出す
      // Then: Article配列が返される
    });
  });
});
```

### 2.3 HackerNewsCollector テスト

```typescript
describe('HackerNewsCollector', () => {
  describe('collectArticles', () => {
    it('検索結果を正しく処理する', async () => {
      // Given: HackerNews 検索APIレスポンス
      // When: collectArticles を呼び出す
      // Then: Article配列が返される
    });

    it('ストーリー詳細の取得エラー処理', async () => {
      // Given: ストーリー詳細取得エラー
      // When: collectArticles を呼び出す
      // Then: エラーが適切にログされ、処理が続行される
    });
  });

  describe('getStoryDetails', () => {
    it('ストーリーIDから詳細情報を取得する', async () => {
      // Given: 有効なストーリーID
      // When: getStoryDetails を呼び出す
      // Then: Article が返される
    });
  });
});
```

### 2.4 DevToCollector テスト

```typescript
describe('DevToCollector', () => {
  describe('collectArticles', () => {
    it('Dev.to API レスポンスを処理する', async () => {
      // Given: Dev.to APIレスポンス
      // When: collectArticles を呼び出す
      // Then: Article配列が返される
    });

    it('ページネーション処理', async () => {
      // Given: 複数ページのレスポンス
      // When: collectArticles を呼び出す
      // Then: 全ページの記事が取得される
    });
  });
});
```

### 2.5 ArticleCollectorService テスト

```typescript
describe('ArticleCollectorService', () => {
  describe('collectAllArticles', () => {
    it('全ソースから記事を収集する', async () => {
      // Given: 各コレクターがモック化されている
      // When: collectAllArticles を呼び出す
      // Then: 全ソースの記事が収集される
    });

    it('一部ソースでエラーが発生しても他は継続する', async () => {
      // Given: 一つのコレクターがエラーを返す
      // When: collectAllArticles を呼び出す
      // Then: 他のソースの記事は正常に収集される
    });

    it('重複記事の除外', async () => {
      // Given: 重複するURLの記事
      // When: collectAllArticles を呼び出す
      // Then: 重複が除外される
    });

    it('関連度フィルタリング', async () => {
      // Given: 低関連度の記事
      // When: collectAllArticles を呼び出す
      // Then: フィルタされる
    });
  });

  describe('calculateRelevanceScore', () => {
    it('キーワードマッチで高スコア', () => {
      // Given: AIキーワードを含む記事
      // When: calculateRelevanceScore を呼び出す
      // Then: 高い関連度スコアが返される
    });

    it('関連性の低い記事で低スコア', () => {
      // Given: AI以外の記事
      // When: calculateRelevanceScore を呼び出す
      // Then: 低い関連度スコアが返される
    });
  });
});
```

### 2.6 DiscordNotifierService テスト

```typescript
describe('DiscordNotifierService', () => {
  describe('sendArticleNotification', () => {
    it('記事リストをDiscordに送信する', async () => {
      // Given: 記事配列とモックされたwebhook
      // When: sendArticleNotification を呼び出す
      // Then: 適切なペイロードが送信される
    });

    it('空の記事リストの処理', async () => {
      // Given: 空の記事配列
      // When: sendArticleNotification を呼び出す
      // Then: 「記事なし」メッセージが送信される
    });

    it('Webhook送信エラーの処理', async () => {
      // Given: Webhook エラーレスポンス
      // When: sendArticleNotification を呼び出す
      // Then: エラーが適切にログされる
    });

    it('大量記事のバッチ処理', async () => {
      // Given: 20記事（制限超過）
      // When: sendArticleNotification を呼び出す
      // Then: 複数メッセージに分割される
    });
  });

  describe('formatArticleMessage', () => {
    it('記事をDiscord Embed形式に変換する', () => {
      // Given: Article オブジェクト
      // When: formatArticleMessage を呼び出す
      // Then: DiscordEmbed が返される
    });

    it('長いタイトルの切り詰め', () => {
      // Given: 長いタイトルの記事
      // When: formatArticleMessage を呼び出す
      // Then: タイトルが切り詰められる
    });
  });
});
```

## 3. 結合テスト設計

### 3.1 API統合テスト

```typescript
describe('API Integration Tests', () => {
  describe('Real API calls', () => {
    it('Qiita APIから実際の記事を取得する', async () => {
      // Given: 実際のQiita API
      // When: QiitaCollector で記事を取得
      // Then: 有効な記事データが返される
    });

    it('Zenn RSSから実際の記事を取得する', async () => {
      // Given: 実際のZenn RSS
      // When: ZennCollector で記事を取得
      // Then: 有効な記事データが返される
    });

    // Note: 実際のAPIテストは制限されたCIでのみ実行
  });
});
```

### 3.2 サービス統合テスト

```typescript
describe('Service Integration Tests', () => {
  it('記事収集から Discord通知までの統合フロー', async () => {
    // Given: モックされた外部API、実際のサービス連携
    // When: メインフローを実行
    // Then: 記事が収集され、適切にDiscordに送信される
  });

  it('エラー時のフォールバック処理', async () => {
    // Given: 一部サービスでエラー
    // When: メインフローを実行
    // Then: エラーログが記録され、可能な処理は継続される
  });
});
```

## 4. E2Eテスト設計

### 4.1 全体フローテスト

```typescript
describe('End-to-End Tests', () => {
  it('日次実行の完全フロー', async () => {
    // Given: テスト用のDiscord webhook
    // When: main.ts を実行
    // Then: 
    //   - 各ソースから記事が収集される
    //   - 重複が除外される
    //   - Discord通知が送信される
    //   - ログが適切に出力される
  });

  it('設定ファイル変更の反映', async () => {
    // Given: 変更された keywords.json
    // When: main.ts を実行
    // Then: 新しい設定が反映される
  });

  it('外部API全エラー時の動作', async () => {
    // Given: 全外部APIがエラー
    // When: main.ts を実行
    // Then: エラー通知がDiscordに送信される
  });
});
```

## 5. パフォーマンステスト設計

### 5.1 負荷テスト

```typescript
describe('Performance Tests', () => {
  it('大量記事処理のパフォーマンス', async () => {
    // Given: 1000記事のモックデータ
    // When: 処理を実行
    // Then: 10分以内に完了する
  });

  it('メモリ使用量テスト', async () => {
    // Given: 大量記事データ
    // When: 処理を実行
    // Then: メモリリークが発生しない
  });

  it('並列API呼び出しのパフォーマンス', async () => {
    // Given: 複数API呼び出し
    // When: 並列実行
    // Then: 順次実行より高速
  });
});
```

## 6. セキュリティテスト設計

### 6.1 入力検証テスト

```typescript
describe('Security Tests', () => {
  it('悪意のあるURL の処理', async () => {
    // Given: 不正なURL
    // When: 記事処理
    // Then: 適切に無害化される
  });

  it('XSS攻撃ベクターの処理', async () => {
    // Given: スクリプトタグを含む記事
    // When: Discord通知処理
    // Then: スクリプトがエスケープされる
  });

  it('機密情報の ログ出力防止', async () => {
    // Given: API キーを含む設定
    // When: エラーログ出力
    // Then: 機密情報がマスクされる
  });
});
```

## 7. GitHub Actions テスト設計

### 7.1 ワークフローテスト

```yaml
# .github/workflows/test.yml
name: Test Workflow
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run test:integration
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.TEST_DISCORD_WEBHOOK_URL }}
```

### 7.2 定期実行テスト

- **スケジュール動作確認**: cron設定の正確性
- **環境変数アクセス**: Secrets の正しい参照
- **タイムアウト処理**: 10分制限の確認

## 8. モック設計

### 8.1 外部API モック

```typescript
// Qiita API モック
const mockQiitaResponse = {
  data: [
    {
      id: "test-id-1",
      title: "AI技術の最新動向",
      url: "https://qiita.com/test/items/test-id-1",
      user: { id: "test-user", name: "テストユーザー" },
      created_at: "2024-01-15T10:00:00+09:00",
      tags: [{ name: "AI" }, { name: "機械学習" }],
      body: "記事本文..."
    }
  ]
};

// Zenn RSS モック
const mockZennRSS = `
  <?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <item>
        <title>LLMを活用した開発手法</title>
        <link>https://zenn.dev/test/articles/test-id-1</link>
        <pubDate>Mon, 15 Jan 2024 10:00:00 +0900</pubDate>
        <description>記事の概要...</description>
      </item>
    </channel>
  </rss>
`;
```

### 8.2 Discord Webhook モック

```typescript
const mockDiscordWebhook = jest.fn().mockResolvedValue({
  status: 200,
  data: { message: "success" }
});
```

## 9. テストデータ設計

### 9.1 テスト記事データ

```typescript
const testArticles: Article[] = [
  {
    id: "test-1",
    title: "ChatGPTを使った開発効率化",
    url: "https://example.com/article-1",
    author: "テスト太郎",
    publishedAt: new Date("2024-01-15T10:00:00Z"),
    source: "qiita",
    tags: ["AI", "ChatGPT", "開発"],
    excerpt: "ChatGPTを活用した開発手法について...",
    relevanceScore: 0.9
  }
];
```

## 10. テスト実行設計

### 10.1 package.json スクリプト

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration", 
    "test:e2e": "jest --testPathPattern=e2e",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch"
  }
}
```

### 10.2 Jest設定

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

## 11. 継続的テスト運用

### 11.1 テスト自動化

- **PR作成時**: 全テスト実行
- **main ブランチプッシュ**: フルテストスイート + デプロイ
- **定期実行**: 週次での結合テスト実行

### 11.2 テストメンテナンス

- **外部API変更対応**: 月次でのAPI仕様確認
- **モックデータ更新**: 実際のレスポンス形式変更への追従
- **パフォーマンス閾値調整**: システム成長に応じた基準見直し