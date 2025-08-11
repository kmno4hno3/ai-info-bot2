import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { Article, ZennArticle } from '../types/Article';
import { logger } from '../utils/logger';
import { RetryService } from '../utils/retry';

interface ZennCollectorConfig {
  baseUrl: string;
  timeout: number;
  maxArticlesPerTopic: number;
}

interface ZennRSSItem {
  title?: string[];
  link?: string[];
  pubDate?: string[];
  description?: string[];
  'dc:creator'?: string[];
  author?: string[];
}

interface ZennRSSChannel {
  item?: ZennRSSItem[];
}

interface ZennRSSFeed {
  rss?: {
    channel?: ZennRSSChannel[];
  };
}

export class ZennCollector {
  private config: ZennCollectorConfig;
  private static readonly DEFAULT_CONFIG: ZennCollectorConfig = {
    baseUrl: 'https://zenn.dev',
    timeout: 10000,
    maxArticlesPerTopic: 50,
  };

  constructor(config: Partial<ZennCollectorConfig> = {}) {
    this.config = { ...ZennCollector.DEFAULT_CONFIG, ...config };
    logger.debug('ZennCollector初期化完了', this.config);
  }

  public async collectArticles(
    topics: string[],
    since?: Date
  ): Promise<Article[]> {
    logger.info(`Zenn記事収集開始: トピック ${topics.length} 個`);

    try {
      const allArticles: Article[] = [];

      for (const topic of topics) {
        logger.debug(`Zennトピック "${topic}" の記事を収集中...`);

        const topicArticles = await RetryService.withRetryCondition(
          () => this.fetchArticlesByTopic(topic, since),
          RetryService.createHttpRetryCondition(),
          { maxRetries: 3, baseDelay: 1500 },
          `Zenn topic "${topic}" collection`
        );

        allArticles.push(...topicArticles);
        logger.debug(`トピック "${topic}": ${topicArticles.length} 記事を収集`);

        // Rate limit対策で少し待機
        await this.sleep(300);
      }

      const uniqueArticles = this.removeDuplicatesByUrl(allArticles);

      logger.info(
        `Zenn記事収集完了: ${uniqueArticles.length} 記事 ` +
          `(重複除外前: ${allArticles.length} 記事)`
      );

      return uniqueArticles;
    } catch (error) {
      logger.error('Zenn記事収集でエラーが発生', error);
      throw error;
    }
  }

  private async fetchArticlesByTopic(
    topic: string,
    since?: Date
  ): Promise<Article[]> {
    try {
      const rssUrl = `${this.config.baseUrl}/topics/${topic}/feed`;
      logger.debug(`Zenn RSS取得中: ${rssUrl}`);

      const response = await axios.get(rssUrl, {
        timeout: this.config.timeout,
        headers: {
          'User-Agent': 'AI-Article-Bot/1.0',
        },
      });

      const articles = await this.parseRSSFeed(response.data, topic);

      // 日付フィルタリング適用
      const filteredArticles = articles.filter(article =>
        this.isArticleRecentEnough(article, since)
      );

      // 最大記事数制限適用
      const limitedArticles = filteredArticles.slice(
        0,
        this.config.maxArticlesPerTopic
      );

      logger.debug(
        `トピック "${topic}": パース ${articles.length} → ` +
          `フィルタ後 ${filteredArticles.length} → ` +
          `制限適用後 ${limitedArticles.length} 記事`
      );

      return limitedArticles;
    } catch (error) {
      logger.error(`トピック "${topic}" での RSS取得エラー`, error);
      return []; // 一つのトピックでエラーが発生しても他は継続
    }
  }

  public async parseRSSFeed(
    xmlContent: string,
    topic: string
  ): Promise<Article[]> {
    try {
      const parsedData: ZennRSSFeed = await parseStringPromise(xmlContent);

      if (!parsedData.rss?.channel?.[0]?.item) {
        logger.warn(
          `トピック "${topic}" のRSSフィードにアイテムが見つかりません`
        );
        return [];
      }

      const articles: Article[] = [];
      const items = parsedData.rss.channel[0].item;

      for (const item of items) {
        try {
          const article = this.transformToArticle(item, topic);
          articles.push(article);
        } catch (error) {
          logger.warn('Zenn RSS アイテムの変換でエラー', { item, error });
          // 一つのアイテムでエラーが発生しても他は継続
        }
      }

      logger.debug(
        `トピック "${topic}": ${articles.length} 記事をパースしました`
      );
      return articles;
    } catch (error) {
      logger.error('Zenn RSS パースでエラーが発生', error);
      throw new Error(`Failed to parse Zenn RSS: ${String(error)}`);
    }
  }

  private transformToArticle(item: ZennRSSItem, topic: string): Article {
    // 必須フィールドの検証
    if (!item.title?.[0] || !item.link?.[0] || !item.pubDate?.[0]) {
      throw new Error('RSS item missing required fields');
    }

    const title = this.cleanText(item.title[0]);
    const url = item.link[0];
    const pubDate = new Date(item.pubDate[0]);
    const description = item.description?.[0]
      ? this.cleanText(item.description[0])
      : '';
    const author = item['dc:creator']?.[0] || item.author?.[0] || 'Unknown';

    // IDをURLから抽出
    const urlMatch = url.match(/\/([^\/]+)$/);
    const id = urlMatch ? urlMatch[1] : `zenn-${Date.now()}`;

    return {
      id: `zenn-${id}`,
      title,
      url,
      author: this.cleanText(author),
      publishedAt: pubDate,
      source: 'zenn',
      tags: [topic], // トピック名をタグとして使用
      excerpt: this.extractExcerpt(description),
      relevanceScore: 0, // フィルタリング段階で算出される
    };
  }

  private cleanText(text: string): string {
    if (!text) return '';

    return text
      .replace(/<[^>]*>/g, '') // HTML タグを除去
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // 連続する空白を単一に
      .trim();
  }

  private extractExcerpt(description: string, maxLength = 200): string {
    if (!description) return '';

    const cleaned = this.cleanText(description);

    return cleaned.length > maxLength
      ? cleaned.substring(0, maxLength) + '...'
      : cleaned;
  }

  private isArticleRecentEnough(article: Article, since?: Date): boolean {
    if (!since) return true;
    return article.publishedAt >= since;
  }

  private removeDuplicatesByUrl(articles: Article[]): Article[] {
    const seen = new Set<string>();
    return articles.filter(article => {
      if (seen.has(article.url)) {
        return false;
      }
      seen.add(article.url);
      return true;
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getConfig(): ZennCollectorConfig {
    return { ...this.config };
  }

  // Zennで利用可能な人気トピック一覧
  public static getPopularTopics(): string[] {
    return [
      'ai',
      'machinelearning',
      'deeplearning',
      'chatgpt',
      'python',
      'javascript',
      'typescript',
      'react',
      'nextjs',
      'vue',
      'nodejs',
      'go',
      'rust',
      'docker',
      'kubernetes',
      'aws',
      'gcp',
      'azure',
    ];
  }

  // AI関連のトピック一覧を取得
  public static getAIRelatedTopics(): string[] {
    return [
      'ai',
      'machinelearning',
      'deeplearning',
      'chatgpt',
      'nlp',
      'computervision',
      'tensorflow',
      'pytorch',
      'openai',
      'llm',
    ];
  }
}
