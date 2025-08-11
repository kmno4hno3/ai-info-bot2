import axios from 'axios';
import { Article } from '../types/Article';
import { logger } from '../utils/logger';
import { RetryService } from '../utils/retry';

interface DiscordEmbed {
  title: string;
  description: string;
  url: string;
  color: number;
  timestamp: string;
  author: {
    name: string;
    icon_url?: string;
  };
  fields: Array<{
    name: string;
    value: string;
    inline: boolean;
  }>;
  footer: {
    text: string;
  };
}

interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

interface DiscordNotifierConfig {
  webhookUrl: string;
  maxEmbedsPerMessage: number;
  maxCharactersPerEmbed: number;
  maxMessageLength: number;
  embedColor: number;
  timeout: number;
}

export class DiscordNotifierService {
  private config: DiscordNotifierConfig;
  private static readonly DEFAULT_CONFIG: Partial<DiscordNotifierConfig> = {
    maxEmbedsPerMessage: 10,
    maxCharactersPerEmbed: 6000,
    maxMessageLength: 2000,
    embedColor: 0x00ff7f, // Spring Green
    timeout: 15000,
  };

  private static readonly SOURCE_COLORS = {
    qiita: 0x55c500, // Qiita Green
    zenn: 0x3ea8ff, // Zenn Blue
    hackernews: 0xff6600, // HN Orange
    devto: 0x0a0a0a, // Dev.to Black
  };

  private static readonly SOURCE_ICONS = {
    qiita: '📝',
    zenn: '📚',
    hackernews: '🔥',
    devto: '💻',
  };

  constructor(webhookUrl: string, config: Partial<DiscordNotifierConfig> = {}) {
    this.config = {
      ...DiscordNotifierService.DEFAULT_CONFIG,
      ...config,
      webhookUrl,
    } as DiscordNotifierConfig;

    logger.info('DiscordNotifierService初期化完了', {
      maxEmbedsPerMessage: this.config.maxEmbedsPerMessage,
      embedColor: this.config.embedColor.toString(16),
    });
  }

  public async sendArticleNotification(articles: Article[]): Promise<void> {
    if (articles.length === 0) {
      await this.sendEmptyNotification();
      return;
    }

    logger.info(`Discord通知送信開始: ${articles.length} 記事`);

    try {
      // 記事をソース別にグループ化
      const articlesBySource = this.groupArticlesBySource(articles);

      // サマリーメッセージを送信
      await this.sendSummaryMessage(articles, articlesBySource);

      // 各ソースごとに記事を送信
      for (const [source, sourceArticles] of Object.entries(articlesBySource)) {
        if (sourceArticles.length > 0) {
          await this.sendArticlesBySource(source, sourceArticles);
          // Discord Rate limit対策
          await this.sleep(1000);
        }
      }

      logger.info(`Discord通知送信完了: ${articles.length} 記事`);
    } catch (error) {
      logger.error('Discord通知送信でエラー', error);
      throw error;
    }
  }

  private async sendSummaryMessage(
    articles: Article[],
    articlesBySource: Record<string, Article[]>
  ): Promise<void> {
    const totalArticles = articles.length;
    const sourceCounts = Object.entries(articlesBySource)
      .map(
        ([source, arts]) =>
          `${this.getSourceIcon(source)} ${source}: ${arts.length}`
      )
      .join('\n');

    const summaryEmbed: DiscordEmbed = {
      title: '🤖 AI記事収集結果',
      description: `本日収集した記事: **${totalArticles}件**\n\n${sourceCounts}`,
      url: '',
      color: this.config.embedColor,
      timestamp: new Date().toISOString(),
      author: {
        name: 'AI Article Bot',
      },
      fields: [
        {
          name: '📊 関連度スコア平均',
          value: this.calculateAverageRelevanceScore(articles).toFixed(3),
          inline: true,
        },
        {
          name: '🎯 トップ記事',
          value: this.getTopArticleTitle(articles),
          inline: true,
        },
      ],
      footer: {
        text:
          'AI Article Collector • ' + new Date().toLocaleDateString('ja-JP'),
      },
    };

    await this.sendMessage({ embeds: [summaryEmbed] });
  }

  private async sendArticlesBySource(
    source: string,
    articles: Article[]
  ): Promise<void> {
    logger.debug(`${source} の記事送信開始: ${articles.length} 記事`);

    // 記事を関連度スコア順にソート
    const sortedArticles = articles.sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    );

    // バッチ処理で送信
    const batches = this.createArticleBatches(sortedArticles);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!batch) continue;
      const embeds = batch.map(article => this.createArticleEmbed(article));

      const headerMessage =
        batches.length > 1
          ? `${this.getSourceIcon(source)} **${source} 記事** (${i + 1}/${batches.length})`
          : `${this.getSourceIcon(source)} **${source} 記事**`;

      await this.sendMessage({
        content: headerMessage,
        embeds: embeds,
      });

      // バッチ間の待機
      if (i < batches.length - 1) {
        await this.sleep(500);
      }
    }

    logger.debug(`${source} の記事送信完了`);
  }

  public createArticleEmbed(article: Article): DiscordEmbed {
    const title = this.truncateText(article.title, 256);
    const description = this.formatDescription(article);
    const color = this.getSourceColor(article.source);

    return {
      title,
      description,
      url: article.url,
      color,
      timestamp: article.publishedAt.toISOString(),
      author: {
        name: `${article.author} • ${article.source}`,
      },
      fields: this.createArticleFields(article),
      footer: {
        text: `関連度: ${article.relevanceScore.toFixed(3)} • ${this.formatPublishTime(article.publishedAt)}`,
      },
    };
  }

  private formatDescription(article: Article): string {
    const parts = [];

    if (article.excerpt) {
      parts.push(this.truncateText(article.excerpt, 300));
    }

    if (article.tags.length > 0) {
      const tagString = article.tags
        .slice(0, 5) // 最大5つのタグ
        .map(tag => `\`${tag}\``)
        .join(' ');
      parts.push(`\n**タグ:** ${tagString}`);
    }

    if (article.score && article.score > 0) {
      const scoreEmoji =
        article.source === 'hackernews'
          ? '⬆️'
          : article.source === 'qiita'
            ? '👍'
            : article.source === 'devto'
              ? '❤️'
              : '👍';
      parts.push(`\n${scoreEmoji} **${article.score}**`);
    }

    return this.truncateText(
      parts.join(''),
      this.config.maxCharactersPerEmbed - 500
    );
  }

  private createArticleFields(
    article: Article
  ): Array<{ name: string; value: string; inline: boolean }> {
    const fields = [];

    // 公開時間
    fields.push({
      name: '📅 公開時間',
      value: this.formatPublishTime(article.publishedAt),
      inline: true,
    });

    // スコア情報
    if (article.score && article.score > 0) {
      const scoreLabel =
        article.source === 'hackernews'
          ? 'Points'
          : article.source === 'qiita'
            ? 'Likes+Stocks'
            : article.source === 'devto'
              ? 'Reactions'
              : 'Score';

      fields.push({
        name: `📊 ${scoreLabel}`,
        value: article.score.toString(),
        inline: true,
      });
    }

    // 関連度スコア
    fields.push({
      name: '🎯 関連度',
      value: `${(article.relevanceScore * 100).toFixed(1)}%`,
      inline: true,
    });

    return fields;
  }

  private async sendEmptyNotification(): Promise<void> {
    const embed: DiscordEmbed = {
      title: '📭 AI記事収集結果',
      description: '本日は収集された記事がありませんでした。',
      url: '',
      color: 0x808080, // Gray
      timestamp: new Date().toISOString(),
      author: {
        name: 'AI Article Bot',
      },
      fields: [
        {
          name: '💡 ヒント',
          value: '検索条件を調整するか、後ほど再実行してみてください。',
          inline: false,
        },
      ],
      footer: {
        text:
          'AI Article Collector • ' + new Date().toLocaleDateString('ja-JP'),
      },
    };

    await this.sendMessage({ embeds: [embed] });
  }

  public async sendMessage(message: DiscordMessage): Promise<void> {
    await RetryService.withRetryCondition(
      async () => {
        const response = await axios.post(this.config.webhookUrl, message, {
          timeout: this.config.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.status !== 204) {
          throw new Error(`Discord API returned status ${response.status}`);
        }

        return response;
      },
      (error: Error) => {
        // Discord specific retry conditions
        const message = error.message.toLowerCase();
        return (
          message.includes('rate limit') ||
          message.includes('timeout') ||
          message.includes('network') ||
          message.includes('5')
        );
      },
      { maxRetries: 3, baseDelay: 2000 },
      'Discord webhook message'
    );
  }

  private groupArticlesBySource(
    articles: Article[]
  ): Record<string, Article[]> {
    const groups: Record<string, Article[]> = {};

    for (const article of articles) {
      const source = article.source;
      if (!groups[source]) {
        groups[source] = [];
      }
      groups[source].push(article);
    }

    return groups;
  }

  private createArticleBatches(articles: Article[]): Article[][] {
    const batches: Article[][] = [];
    const batchSize = this.config.maxEmbedsPerMessage;

    for (let i = 0; i < articles.length; i += batchSize) {
      batches.push(articles.slice(i, i + batchSize));
    }

    return batches;
  }

  private getSourceColor(source: string): number {
    return (
      DiscordNotifierService.SOURCE_COLORS[
        source as keyof typeof DiscordNotifierService.SOURCE_COLORS
      ] || this.config.embedColor
    );
  }

  private getSourceIcon(source: string): string {
    return (
      DiscordNotifierService.SOURCE_ICONS[
        source as keyof typeof DiscordNotifierService.SOURCE_ICONS
      ] || '📄'
    );
  }

  private calculateAverageRelevanceScore(articles: Article[]): number {
    if (articles.length === 0) return 0;
    const sum = articles.reduce(
      (acc, article) => acc + article.relevanceScore,
      0
    );
    return sum / articles.length;
  }

  private getTopArticleTitle(articles: Article[]): string {
    if (articles.length === 0) return 'なし';
    const topArticle = articles.reduce((prev, current) =>
      current.relevanceScore > prev.relevanceScore ? current : prev
    );
    return this.truncateText(topArticle.title, 50);
  }

  private formatPublishTime(publishedAt: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - publishedAt.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}日前`;
    } else if (diffHours > 0) {
      return `${diffHours}時間前`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${Math.max(1, diffMinutes)}分前`;
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // テスト用メソッド
  public async sendTestMessage(): Promise<void> {
    const testEmbed: DiscordEmbed = {
      title: '🧪 テストメッセージ',
      description: 'AI記事収集Botの動作テストです。',
      url: '',
      color: this.config.embedColor,
      timestamp: new Date().toISOString(),
      author: {
        name: 'AI Article Bot - Test',
      },
      fields: [
        {
          name: '✅ ステータス',
          value: '正常に動作しています',
          inline: true,
        },
      ],
      footer: {
        text: 'Test Message • ' + new Date().toLocaleString('ja-JP'),
      },
    };

    await this.sendMessage({ embeds: [testEmbed] });
    logger.info('Discord テストメッセージを送信しました');
  }

  // 設定取得
  public getConfig(): DiscordNotifierConfig {
    return { ...this.config };
  }

  // Webhook URL更新
  public updateWebhookUrl(newWebhookUrl: string): void {
    this.config.webhookUrl = newWebhookUrl;
    logger.info('Discord Webhook URLが更新されました');
  }
}
