# AI記事収集Discord通知Bot

AI関連記事を複数のソースから自動収集し、Discordに通知するBotです。GitHub Actionsによる日次実行で、継続的な情報収集を実現します。

## 🌟 主な機能

- **4つのソースから記事収集**
  - 📝 **Qiita**: AI関連タグの記事
  - 📚 **Zenn**: AI関連トピックの記事  
  - 🔥 **Hacker News**: AI/ML関連ストーリー
  - 💻 **Dev.to**: AI関連タグの記事

- **インテリジェントなフィルタリング**
  - 関連度スコア算出による品質フィルタリング
  - 重複記事の自動除外
  - カスタマイズ可能なキーワード・除外設定

- **リッチなDiscord通知**
  - ソース別カラー・アイコン表示
  - 詳細な記事情報（公開時間、スコア、関連度等）
  - バッチ処理による効率的な通知

- **堅牢なシステム設計**
  - 並列API呼び出しによる高速処理
  - 指数バックオフリトライ機能
  - 包括的なエラーハンドリング

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env`ファイルを作成するか、環境変数を設定してください：

```bash
# 必須
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL

# オプション（APIレート制限緩和用）
QIITA_ACCESS_TOKEN=your_qiita_token
DEVTO_API_KEY=your_devto_api_key
```

### 3. 設定ファイルの確認

`config/keywords.json`で収集設定をカスタマイズできます：

```json
{
  "keywords": ["AI", "機械学習", "ChatGPT", "..."],
  "sources": {
    "qiita": {
      "enabled": true,
      "tags": ["AI", "機械学習", "DeepLearning"]
    }
  },
  "filtering": {
    "minRelevanceScore": 0.3,
    "maxArticlesPerDay": 50
  }
}
```

### 4. ビルド

```bash
npm run build
```

## 📖 使用方法

### 基本的な実行

```bash
# 通常の記事収集・通知
npm run collect

# 開発モード（リアルタイム）
npm run dev
```

### テストモード

```bash
# Discord通知テスト
npm run dev -- --test
```

### 単一ソース実行

```bash
# 特定のソースのみ実行
npm run dev -- --source qiita
npm run dev -- --source zenn  
npm run dev -- --source hackernews
npm run dev -- --source devto
```

## ⚙️ GitHub Actions設定

### 1. リポジトリシークレットの設定

GitHub リポジトリの Settings > Secrets and variables > Actions で以下を設定：

- `DISCORD_WEBHOOK_URL`: Discord Webhook URL（必須）
- `QIITA_ACCESS_TOKEN`: Qiita API トークン（オプション）
- `DEVTO_API_KEY`: Dev.to API キー（オプション）

### 2. ワークフローの確認

- **日次実行**: `.github/workflows/daily-collection.yml`
  - 毎日 UTC 0:00 (JST 9:00) に自動実行
  - 手動実行も可能

- **テスト実行**: `.github/workflows/test.yml`
  - PR作成時、コミット時に自動実行
  - リント、テスト、セキュリティ監査を実行

## 🧪 テスト

```bash
# 全テスト実行
npm test

# 単体テストのみ
npm run test:unit

# 結合テストのみ  
npm run test:integration

# E2Eテストのみ
npm run test:e2e

# カバレッジレポート生成
npm run test:coverage
```

## 📝 開発・カスタマイズ

### プロジェクト構造

```
ai-bot2/
├── src/
│   ├── collectors/          # 各ソースのデータ収集
│   ├── services/           # メインビジネスロジック
│   ├── types/              # TypeScript型定義
│   ├── utils/              # 共通ユーティリティ
│   └── main.ts             # エントリーポイント
├── tests/                  # テストファイル
├── config/                 # 設定ファイル
└── .github/workflows/      # GitHub Actions
```

### 新しいソースの追加

1. `src/collectors/`に新しいコレクタークラスを作成
2. `ArticleCollectorService`に統合
3. 設定ファイルに追加
4. テストを作成

### 通知形式のカスタマイズ

`DiscordNotifierService`の以下を変更：

- `SOURCE_COLORS`: ソース別カラー
- `SOURCE_ICONS`: ソース別アイコン  
- `createArticleEmbed()`: Embed形式

## 🔧 設定詳細

### キーワード設定

`config/keywords.json`で以下を設定可能：

- **keywords**: 関連度算出用キーワードリスト
- **sources**: 各ソースの有効/無効、検索条件
- **filtering**: フィルタリング条件
- **discord**: Discord通知設定

### 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `DISCORD_WEBHOOK_URL` | ✅ | Discord通知先URL |
| `QIITA_ACCESS_TOKEN` | ❌ | QiitaのAPIレート制限緩和用 |
| `DEVTO_API_KEY` | ❌ | Dev.toのAPIレート制限緩和用 |
| `NODE_ENV` | ❌ | 実行環境（test/development/production） |

## 📊 監視・ログ

### ログレベル

- **INFO**: 正常動作、統計情報
- **WARN**: 一部失敗、フィルタリング適用
- **ERROR**: 重要なエラー、処理停止

### 実行統計

各実行後に以下の統計が出力されます：

- 収集記事数（ソース別）
- 実行時間
- エラー発生状況
- フィルタリング結果

## 🛠️ トラブルシューティング

### よくある問題

**1. Discord通知が届かない**
- Webhook URLが正しく設定されているか確認
- URL形式: `https://discord.com/api/webhooks/...`

**2. 記事が収集されない**
- インターネット接続を確認
- APIキーが正しく設定されているか確認
- `config/keywords.json`の設定を確認

**3. GitHub Actionsが失敗する**
- リポジトリシークレットが正しく設定されているか確認
- ログでエラー詳細を確認

### デバッグ方法

```bash
# ログレベルをDEBUGに設定
NODE_ENV=development npm run dev

# 特定ソースのみテスト
npm run dev -- --source qiita

# 設定ファイルの妥当性チェック
node -e "console.log(JSON.stringify(require('./config/keywords.json'), null, 2))"
```

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. コミット (`git commit -m 'Add amazing feature'`)
4. プッシュ (`git push origin feature/amazing-feature`)
5. Pull Request を作成

### 開発ガイドライン

- TypeScriptの型安全性を保つ
- テストカバレッジ80%以上を維持
- ESLint/Prettierルールに準拠
- 意味のあるコミットメッセージを使用

## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照

## 🙏 謝辞

このプロジェクトは以下のAPIとサービスを使用しています：

- [Qiita API v2](https://qiita.com/api/v2/docs)
- [Zenn RSS Feed](https://zenn.dev/)
- [Hacker News API](https://hn.algolia.com/api)
- [Dev.to API](https://developers.forem.com/api)
- [Discord Webhook](https://discord.com/developers/docs/resources/webhook)

## 📞 サポート

質問や問題がある場合：

1. [Issues](https://github.com/your-username/ai-bot2/issues) で既存の問題を検索
2. 新しいIssueを作成して詳細を記載
3. ログやエラーメッセージを含めて報告