# 実装タスクリスト - AI記事収集Discord通知Bot

## 1. プロジェクト基盤構築

### 1.1 プロジェクト初期設定
- [ ] **T001**: package.json作成・依存関係設定
  - TypeScript, Node.js 18+設定
  - Jest, @types/* 開発依存関係
  - Discord.js, axios, xml2js, cheerio等必要ライブラリ
  - スクリプト設定（build, test, lint等）

- [ ] **T002**: TypeScript設定ファイル作成
  - tsconfig.json設定
  - strict mode, ES2022 target設定
  - src/, tests/ ディレクトリ構造設定

- [ ] **T003**: 基本ディレクトリ構造作成
  - src/（services/, collectors/, types/, utils/）
  - tests/（unit/, integration/, e2e/）
  - config/, .github/workflows/ ディレクトリ

- [ ] **T004**: ESLint・Prettier設定
  - .eslintrc.js, .prettierrc設定
  - TypeScript推奨ルール適用

## 2. 型定義・共通ユーティリティ

### 2.1 型定義作成
- [ ] **T005**: Article型定義作成
  - src/types/Article.ts実装
  - CollectionResult, CollectionError型定義

- [ ] **T006**: Config型定義作成
  - 設定ファイル用の型定義
  - 各ソース設定、Discord設定、フィルタリング設定

### 2.2 共通ユーティリティ
- [ ] **T007**: Logger utility作成
  - src/utils/logger.ts実装
  - ログレベル（INFO, WARN, ERROR）
  - 機密情報マスキング機能

- [ ] **T008**: 重複除外utility作成
  - src/utils/deduplication.ts実装
  - URLベースの重複判定

- [ ] **T009**: フィルタリングutility作成
  - src/utils/filtering.ts実装
  - 関連度スコア算出ロジック
  - キーワードマッチング

- [ ] **T010**: リトライutility作成
  - src/utils/retry.ts実装
  - 指数バックオフ機能
  - 最大リトライ回数設定

## 3. データ収集コレクター実装

### 3.1 QiitaCollector実装
- [ ] **T011**: QiitaCollector基底クラス作成
  - src/collectors/QiitaCollector.ts
  - collectArticles, transformToArticle メソッド

- [ ] **T012**: Qiita API統合実装
  - API v2エンドポイント連携
  - タグベースの記事取得
  - ページネーション処理

- [ ] **T013**: QiitaCollector単体テスト
  - tests/unit/collectors/QiitaCollector.test.ts
  - APIレスポンスモック、エラーハンドリングテスト

### 3.2 ZennCollector実装
- [ ] **T014**: ZennCollector実装
  - src/collectors/ZennCollector.ts
  - RSS フィード取得・パース処理

- [ ] **T015**: Zenn RSS統合実装
  - xml2js使用のRSSパース
  - トピックベースの記事取得

- [ ] **T016**: ZennCollector単体テスト
  - RSSフィードモック、XMLパースエラーテスト

### 3.3 HackerNewsCollector実装
- [ ] **T017**: HackerNewsCollector実装
  - src/collectors/HackerNewsCollector.ts
  - Algolia API経由の検索実装

- [ ] **T018**: HackerNews API統合実装
  - 検索API、ストーリー詳細取得
  - スコアベースのフィルタリング

- [ ] **T019**: HackerNewsCollector単体テスト
  - 検索APIレスポンスモック、ストーリー詳細テスト

### 3.4 DevToCollector実装
- [ ] **T020**: DevToCollector実装
  - src/collectors/DevToCollector.ts
  - API v1エンドポイント連携

- [ ] **T021**: Dev.to API統合実装
  - タグベース記事取得
  - ページネーション、人気記事フィルタ

- [ ] **T022**: DevToCollector単体テスト
  - APIレスポンスモック、ページネーションテスト

## 4. サービスレイヤー実装

### 4.1 ArticleCollectorService実装
- [ ] **T023**: ArticleCollectorService基底実装
  - src/services/ArticleCollectorService.ts
  - 各コレクターの統合管理

- [ ] **T024**: 記事収集統合ロジック実装
  - collectAllArticles メソッド
  - 並列収集（Promise.allSettled）
  - エラーハンドリング

- [ ] **T025**: フィルタリング・重複除外実装
  - 関連度スコア算出
  - 重複記事除外処理
  - 記事数制限適用

- [ ] **T026**: ArticleCollectorService単体テスト
  - 各コレクターモック化テスト
  - フィルタリングロジックテスト

### 4.2 DiscordNotifierService実装
- [ ] **T027**: DiscordNotifierService実装
  - src/services/DiscordNotifierService.ts
  - Webhook経由のメッセージ送信

- [ ] **T028**: Discord Embed形式実装
  - 記事情報のEmbed変換
  - バッチ処理（10記事/メッセージ）
  - 文字数制限対応

- [ ] **T029**: DiscordNotifierService単体テスト
  - Webhookモック、Embed形式テスト
  - バッチ処理、エラーハンドリングテスト

## 5. 設定・メイン処理実装

### 5.1 設定管理実装
- [ ] **T030**: 設定ファイル作成
  - config/keywords.json実装
  - キーワード、ソース設定、フィルタリング設定

- [ ] **T031**: 設定読み込み処理実装
  - src/utils/config.ts
  - 環境変数とファイルの統合
  - バリデーション機能

### 5.2 メイン処理実装
- [ ] **T032**: メインエントリーポイント実装
  - src/main.ts
  - サービス初期化、実行フロー
  - エラーハンドリング

- [ ] **T033**: 実行ログ・サマリー機能
  - 実行結果サマリー
  - エラーログ集約
  - 実行時間計測

## 6. GitHub Actions実装

### 6.1 ワークフロー設定
- [ ] **T034**: 日次実行ワークフロー作成
  - .github/workflows/daily-collection.yml
  - cron設定（UTC 0:00 = JST 9:00）
  - 手動実行（workflow_dispatch）対応

- [ ] **T035**: 環境変数・シークレット設定
  - DISCORD_WEBHOOK_URL設定
  - Node.js 18設定
  - npm ci, build, run設定

### 6.2 CI/CDワークフロー
- [ ] **T036**: テスト実行ワークフロー作成
  - .github/workflows/test.yml
  - PR、push時のテスト自動実行
  - カバレッジレポート生成

- [ ] **T037**: リント・フォーマットワークフロー
  - ESLint、Prettierの自動実行
  - 形式チェック自動化

## 7. テスト実装

### 7.1 単体テスト完全実装
- [ ] **T038**: 全Collectorテスト完成
  - エッジケース、エラーハンドリング網羅
  - モック設定、APIレスポンステスト

- [ ] **T039**: 全Serviceテスト完成
  - 統合ロジック、フィルタリングテスト
  - Discord通知、バッチ処理テスト

- [ ] **T040**: Utilityテスト実装
  - Logger、重複除外、フィルタリング
  - リトライ機能テスト

### 7.2 結合・E2Eテスト実装
- [ ] **T041**: API統合テスト実装
  - 実際のAPI呼び出しテスト（制限環境）
  - レスポンス形式検証

- [ ] **T042**: E2Eテスト実装
  - main.ts全体フロー実行テスト
  - Discord通知まで完全テスト

- [ ] **T043**: GitHub Actionsテスト
  - ワークフロー動作確認
  - 環境変数、シークレット検証

## 8. ドキュメント・最終調整

### 8.1 ドキュメント作成
- [ ] **T044**: README.md作成
  - プロジェクト概要、セットアップ手順
  - 使用方法、設定方法説明

- [ ] **T045**: API仕様・設定ドキュメント
  - 各ソースのAPI使用方法
  - 設定ファイル詳細説明

### 8.2 最終検証・調整
- [ ] **T046**: パフォーマンス最適化
  - 実行時間測定・改善
  - メモリ使用量チェック

- [ ] **T047**: セキュリティ検証
  - 機密情報漏洩チェック
  - 入力検証強化

- [ ] **T048**: 本番環境での動作確認
  - 実際のDiscordチャンネルでのテスト
  - GitHub Actions本番実行確認

## 9. 実装優先順位

### Phase 1: 基盤構築（T001-T010）
**目標**: プロジェクト基盤、型定義、共通ユーティリティ完成
**期間**: 1-2日

### Phase 2: コア機能実装（T011-T033）
**目標**: 記事収集、Discord通知の基本機能完成
**期間**: 3-4日

### Phase 3: CI/CD・テスト（T034-T043）
**目標**: GitHub Actions、包括的テスト完成
**期間**: 2-3日

### Phase 4: 仕上げ・検証（T044-T048）
**目標**: ドキュメント、最終調整、本番確認
**期間**: 1-2日

## 10. 依存関係マップ

```
Phase 1 (基盤) → Phase 2 (コア機能)
     ↓              ↓
Phase 3 (CI/CD・テスト) → Phase 4 (仕上げ)
```

### 重要な依存関係
- T005, T006 (型定義) → 全実装タスク
- T007-T010 (ユーティリティ) → コレクター・サービス実装
- T011-T022 (コレクター) → T023-T026 (統合サービス)
- T027-T029 (Discord通知) → T032 (メイン処理)
- T030-T031 (設定) → T032 (メイン処理)

## 11. 品質基準

### 完了条件
- [ ] 全単体テストのパス（カバレッジ80%以上）
- [ ] E2Eテスト完全動作
- [ ] GitHub Actions定期実行成功
- [ ] 実際のDiscordチャンネルへの通知確認
- [ ] パフォーマンス基準クリア（10分以内実行）

### 検収基準
- [ ] 指定サイト（Qiita, Zenn, HackerNews, Dev.to）からのAI記事収集
- [ ] 重複除外、関連度フィルタリング機能動作
- [ ] 日次定期実行（JST 9:00）でのDiscord通知
- [ ] エラー時の適切なログ出力・通知