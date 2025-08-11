#!/usr/bin/env node

import { ArticleCollectorService } from './services/ArticleCollectorService';
import { DiscordNotifierService } from './services/DiscordNotifierService';
import { ConfigLoader } from './utils/config';
import { logger } from './utils/logger';

interface ExecutionSummary {
  startTime: Date;
  endTime: Date;
  duration: number;
  totalArticles: number;
  sourceBreakdown: Record<string, number>;
  errors: string[];
  success: boolean;
}

async function main(): Promise<void> {
  const startTime = new Date();
  logger.info('=== AI記事収集Bot 実行開始 ===');

  const summary: ExecutionSummary = {
    startTime,
    endTime: startTime,
    duration: 0,
    totalArticles: 0,
    sourceBreakdown: {},
    errors: [],
    success: false,
  };

  try {
    // 1. 設定読み込み
    logger.info('Step 1: 設定ファイル読み込み');
    const config = ConfigLoader.loadConfig();

    // 環境変数の確認
    const envVars = ConfigLoader.getEnvironmentVariables();
    logger.info('環境変数確認完了', envVars);

    // 2. サービス初期化
    logger.info('Step 2: サービス初期化');
    const articleCollectorService = new ArticleCollectorService(config);
    const discordNotifierService = new DiscordNotifierService(
      config.discord.webhookUrl,
      {
        maxEmbedsPerMessage: config.discord.maxArticlesPerBatch,
        embedColor: parseInt(config.discord.embedColor, 16),
      }
    );

    // 3. 記事収集
    logger.info('Step 3: 記事収集実行');
    const collectionResult = await articleCollectorService.collectAllArticles();

    // エラー情報を記録
    if (collectionResult.errors.length > 0) {
      summary.errors = collectionResult.errors.map(
        err => `${err.source}: ${err.error}`
      );
      logger.warn(`収集エラー: ${summary.errors.length} 件`, summary.errors);
    }

    // 統計情報を生成
    summary.totalArticles = collectionResult.articles.length;
    summary.sourceBreakdown = generateSourceBreakdown(
      collectionResult.articles
    );

    // 収集結果のサマリー
    const stats = articleCollectorService.getCollectionStats();
    logger.info('記事収集統計', {
      totalArticles: summary.totalArticles,
      enabledSources: stats.enabledSources,
      sourceBreakdown: summary.sourceBreakdown,
    });

    // 4. Discord通知
    if (summary.totalArticles > 0) {
      logger.info('Step 4: Discord通知送信');
      await discordNotifierService.sendArticleNotification(
        collectionResult.articles
      );
      logger.info(`Discord通知完了: ${summary.totalArticles} 記事を送信`);
    } else {
      logger.info('Step 4: 空の通知送信');
      await discordNotifierService.sendArticleNotification([]);
      logger.info('記事が見つからなかったため空の通知を送信');
    }

    // 5. 実行完了
    summary.success = true;
    summary.endTime = new Date();
    summary.duration = summary.endTime.getTime() - summary.startTime.getTime();

    logger.info('=== AI記事収集Bot 実行完了 ===', {
      duration: `${summary.duration}ms`,
      totalArticles: summary.totalArticles,
      success: summary.success,
    });

    // 成功時の詳細ログ
    logExecutionSummary(summary);
  } catch (error) {
    summary.endTime = new Date();
    summary.duration = summary.endTime.getTime() - summary.startTime.getTime();
    summary.success = false;

    const errorMessage = error instanceof Error ? error.message : String(error);
    summary.errors.push(`Fatal: ${errorMessage}`);

    logger.error('=== AI記事収集Bot 実行失敗 ===', error);
    logExecutionSummary(summary);

    // Discord にエラー通知を送信（可能であれば）
    try {
      await sendErrorNotification(error);
    } catch (notificationError) {
      logger.error('エラー通知の送信に失敗', notificationError);
    }

    // 非ゼロ終了コード
    process.exit(1);
  }
}

function generateSourceBreakdown(
  articles: import('./types/Article').Article[]
): Record<string, number> {
  const breakdown: Record<string, number> = {};

  for (const article of articles) {
    const source = article.source;
    breakdown[source] = (breakdown[source] || 0) + 1;
  }

  return breakdown;
}

function logExecutionSummary(summary: ExecutionSummary): void {
  const durationSeconds = (summary.duration / 1000).toFixed(2);

  logger.info('📊 実行サマリー', {
    開始時刻: summary.startTime.toLocaleString('ja-JP'),
    終了時刻: summary.endTime.toLocaleString('ja-JP'),
    実行時間: `${durationSeconds}秒`,
    収集記事数: summary.totalArticles,
    ソース別: summary.sourceBreakdown,
    エラー数: summary.errors.length,
    成功: summary.success ? 'Yes' : 'No',
  });

  if (summary.errors.length > 0) {
    logger.warn('📋 エラー詳細', summary.errors);
  }
}

async function sendErrorNotification(error: unknown): Promise<void> {
  try {
    // 設定を再読み込みしてエラー通知を送信
    const config = ConfigLoader.loadConfig();
    const discordService = new DiscordNotifierService(
      config.discord.webhookUrl
    );

    const errorMessage = error instanceof Error ? error.message : String(error);
    const embed = {
      title: '❌ AI記事収集Bot エラー',
      description: `実行中にエラーが発生しました：\n\`\`\`${errorMessage}\`\`\``,
      url: '',
      color: 0xff0000, // Red
      timestamp: new Date().toISOString(),
      author: {
        name: 'AI Article Bot - Error',
      },
      fields: [
        {
          name: '🕒 発生時刻',
          value: new Date().toLocaleString('ja-JP'),
          inline: true,
        },
        {
          name: '💡 対処方法',
          value: 'ログを確認して問題を特定してください',
          inline: true,
        },
      ],
      footer: {
        text: 'Error Notification • AI Article Collector',
      },
    };

    await discordService.sendMessage({ embeds: [embed] });
    logger.info('エラー通知をDiscordに送信しました');
  } catch {
    // エラー通知の送信に失敗してもメイン処理には影響させない
    logger.debug('エラー通知の送信をスキップしました');
  }
}

// 実行時引数の処理
function parseCommandLineArgs(): {
  testMode: boolean;
  source?: string;
  help?: boolean;
} {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const help = args.includes('--help') || args.includes('-h');
  const sourceIndex = args.indexOf('--source');
  const source =
    sourceIndex !== -1 && sourceIndex + 1 < args.length
      ? args[sourceIndex + 1]
      : undefined;

  return { testMode, help, ...(source && { source }) };
}

// ヘルプメッセージを表示
function showHelp(): void {
  console.log(`
AI記事収集Discord通知Bot

使用方法:
  npm run dev [オプション]

オプション:
  --test              テストモード（Discord通知のテスト送信）
  --source <name>     特定のソースのみ実行 (qiita, zenn, hackernews, devto)
  --help, -h          このヘルプを表示

例:
  npm run dev --test
  npm run dev --source qiita
  npm run collect
`);
}

// テストモードの実行
async function runTestMode(): Promise<void> {
  logger.info('=== テストモード実行 ===');

  try {
    const config = ConfigLoader.loadConfig();
    const discordService = new DiscordNotifierService(
      config.discord.webhookUrl
    );

    await discordService.sendTestMessage();
    logger.info('テストメッセージ送信完了');
  } catch (error) {
    logger.error('テストモード実行エラー', error);
    process.exit(1);
  }
}

// 特定ソースのみ実行
async function runSourceSpecific(sourceName: string): Promise<void> {
  logger.info(`=== ${sourceName} 単体実行 ===`);

  try {
    const config = ConfigLoader.loadConfig();
    const articleCollectorService = new ArticleCollectorService(config);

    const articles =
      await articleCollectorService.collectFromSource(sourceName);
    logger.info(`${sourceName} から ${articles.length} 記事を収集`);

    // 簡易的な出力
    articles.forEach((article, index) => {
      logger.info(
        `${index + 1}. ${article.title} (${article.relevanceScore.toFixed(3)})`
      );
    });
  } catch (error) {
    logger.error(`${sourceName} 単体実行エラー`, error);
    process.exit(1);
  }
}

// メイン実行
if (require.main === module) {
  const { testMode, source, help } = parseCommandLineArgs();

  if (help) {
    showHelp();
    process.exit(0);
  } else if (testMode) {
    runTestMode().catch(error => {
      logger.error('テストモード実行でエラー', error);
      process.exit(1);
    });
  } else if (source) {
    runSourceSpecific(source).catch(error => {
      logger.error('ソース別実行でエラー', error);
      process.exit(1);
    });
  } else {
    main().catch(error => {
      logger.error('メイン処理でキャッチされていないエラー', error);
      process.exit(1);
    });
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('SIGINT受信 - graceful shutdown');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM受信 - graceful shutdown');
  process.exit(0);
});

export { main };
