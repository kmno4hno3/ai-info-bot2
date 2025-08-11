import { Article, CollectionResult, CollectionError } from '../types/Article';
import { Config } from '../types/Config';
import { QiitaCollector } from '../collectors/QiitaCollector';
import { ZennCollector } from '../collectors/ZennCollector';
import { HackerNewsCollector } from '../collectors/HackerNewsCollector';
import { DevToCollector } from '../collectors/DevToCollector';
import { FilteringService } from '../utils/filtering';
import { DeduplicationService } from '../utils/deduplication';
import { logger } from '../utils/logger';
import { RetryService } from '../utils/retry';

interface CollectorInstance {
  name: string;
  collect: () => Promise<Article[]>;
  enabled: boolean;
}

export class ArticleCollectorService {
  private config: Config;
  private filteringService: FilteringService;
  private deduplicationService: DeduplicationService;
  private collectors: CollectorInstance[];

  constructor(config: Config) {
    this.config = config;
    this.filteringService = new FilteringService();
    this.deduplicationService = new DeduplicationService();
    this.collectors = this.initializeCollectors();

    logger.info('ArticleCollectorService初期化完了', {
      enabledSources: this.getEnabledSources(),
    });
  }

  public async collectAllArticles(): Promise<CollectionResult> {
    const startTime = Date.now();
    logger.info('記事収集プロセス開始');

    const result: CollectionResult = {
      articles: [],
      errors: [],
      timestamp: new Date(),
    };

    try {
      // Step 1: 各ソースから並列で記事を収集
      const collectionResults = await this.collectFromAllSources();

      // Step 2: 結果をマージ
      const { articles, errors } =
        this.mergeCollectionResults(collectionResults);
      result.errors = errors;

      if (articles.length === 0) {
        logger.warn('全てのソースから記事を収集できませんでした');
        return result;
      }

      logger.info(`生の記事収集完了: ${articles.length} 記事`);

      // Step 3: 重複除外
      const uniqueArticles = this.deduplicateArticles(articles);
      logger.info(`重複除外後: ${uniqueArticles.length} 記事`);

      // Step 4: フィルタリング
      const filteredArticles = this.filterArticles(uniqueArticles);
      logger.info(`フィルタリング後: ${filteredArticles.length} 記事`);

      result.articles = filteredArticles;

      const duration = Date.now() - startTime;
      logger.info(
        `記事収集プロセス完了: ${result.articles.length} 記事、${duration}ms`
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`記事収集プロセスでエラー (${duration}ms)`, error);

      result.errors.push({
        source: 'ArticleCollectorService',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });

      return result;
    }
  }

  private async collectFromAllSources(): Promise<
    PromiseSettledResult<Article[]>[]
  > {
    logger.info(`${this.collectors.length} のソースから並列収集開始`);

    // 各コレクターを並列実行
    const collectionPromises = this.collectors
      .filter(collector => collector.enabled)
      .map(collector =>
        RetryService.withRetry(
          collector.collect,
          { maxRetries: 2, baseDelay: 3000 },
          `Collect from ${collector.name}`
        )
      );

    const results = await Promise.allSettled(collectionPromises);

    logger.info(
      `並列収集完了: ${results.filter(r => r.status === 'fulfilled').length} 成功、` +
        `${results.filter(r => r.status === 'rejected').length} 失敗`
    );

    return results;
  }

  private mergeCollectionResults(results: PromiseSettledResult<Article[]>[]): {
    articles: Article[];
    errors: CollectionError[];
  } {
    const articles: Article[] = [];
    const errors: CollectionError[] = [];

    results.forEach((result, index) => {
      const collectorName = this.getEnabledSources()[index];

      if (result.status === 'fulfilled') {
        articles.push(...result.value);
        logger.debug(`${collectorName}: ${result.value.length} 記事を収集`);
      } else {
        const errorMessage =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);

        errors.push({
          source: collectorName,
          error: errorMessage,
          timestamp: new Date(),
        });

        logger.warn(`${collectorName} での収集に失敗`, result.reason);
      }
    });

    return { articles, errors };
  }

  private deduplicateArticles(articles: Article[]): Article[] {
    return this.deduplicationService.deduplicateArticles(articles);
  }

  private filterArticles(articles: Article[]): Article[] {
    const criteria = {
      keywords: this.config.keywords,
      excludeKeywords: this.config.filtering.excludeKeywords,
      minRelevanceScore: this.config.filtering.minRelevanceScore,
      maxArticlesPerDay: this.config.filtering.maxArticlesPerDay,
    };

    return this.filteringService.filterArticles(articles, criteria);
  }

  private initializeCollectors(): CollectorInstance[] {
    const collectors: CollectorInstance[] = [];

    // Qiita Collector
    if (this.config.sources.qiita.enabled) {
      const qiitaCollector = new QiitaCollector({
        accessToken: this.config.sources.qiita.accessToken,
      });

      collectors.push({
        name: 'Qiita',
        enabled: true,
        collect: async () => {
          const since = this.calculateSinceDate();
          return qiitaCollector.collectArticles(
            this.config.sources.qiita.tags,
            since
          );
        },
      });
    }

    // Zenn Collector
    if (this.config.sources.zenn.enabled) {
      const zennCollector = new ZennCollector();

      collectors.push({
        name: 'Zenn',
        enabled: true,
        collect: async () => {
          const since = this.calculateSinceDate();
          return zennCollector.collectArticles(
            this.config.sources.zenn.topics,
            since
          );
        },
      });
    }

    // HackerNews Collector
    if (this.config.sources.hackernews.enabled) {
      const hackerNewsCollector = new HackerNewsCollector();

      collectors.push({
        name: 'HackerNews',
        enabled: true,
        collect: async () => {
          const since = this.calculateSinceDate();
          return hackerNewsCollector.collectArticles(
            this.config.sources.hackernews.searchTerms,
            since
          );
        },
      });
    }

    // Dev.to Collector
    if (this.config.sources.devto.enabled) {
      const devtoCollector = new DevToCollector({
        apiKey: this.config.sources.devto.apiKey,
      });

      collectors.push({
        name: 'Dev.to',
        enabled: true,
        collect: async () => {
          const since = this.calculateSinceDate();
          return devtoCollector.collectArticles(
            this.config.sources.devto.tags,
            since
          );
        },
      });
    }

    return collectors;
  }

  private calculateSinceDate(): Date {
    // デフォルトは過去24時間
    const hoursAgo = 24;
    return new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  }

  private getEnabledSources(): string[] {
    return this.collectors
      .filter(collector => collector.enabled)
      .map(collector => collector.name);
  }

  // 統計情報取得
  public getCollectionStats(): {
    totalSources: number;
    enabledSources: string[];
    cacheStats: { urls: number; titles: number };
  } {
    return {
      totalSources: this.collectors.length,
      enabledSources: this.getEnabledSources(),
      cacheStats: this.deduplicationService.getCacheStats(),
    };
  }

  // 設定更新
  public updateConfig(newConfig: Config): void {
    this.config = newConfig;
    this.collectors = this.initializeCollectors();
    this.deduplicationService.clearCache();

    logger.info('ArticleCollectorService設定更新完了', {
      enabledSources: this.getEnabledSources(),
    });
  }

  // 特定のソースからのみ収集
  public async collectFromSource(sourceName: string): Promise<Article[]> {
    const collector = this.collectors.find(
      c => c.name.toLowerCase() === sourceName.toLowerCase()
    );

    if (!collector) {
      throw new Error(`Source "${sourceName}" not found`);
    }

    if (!collector.enabled) {
      throw new Error(`Source "${sourceName}" is disabled`);
    }

    logger.info(`単一ソース収集開始: ${sourceName}`);

    try {
      const articles = await collector.collect();
      logger.info(`${sourceName} から ${articles.length} 記事を収集`);
      return articles;
    } catch (error) {
      logger.error(`${sourceName} からの収集でエラー`, error);
      throw error;
    }
  }

  // キャッシュクリア
  public clearCache(): void {
    this.deduplicationService.clearCache();
    logger.info('ArticleCollectorServiceキャッシュをクリアしました');
  }

  // 関連度スコア計算（テスト用）
  public calculateRelevanceScore(article: Article): number {
    return this.filteringService.calculateRelevanceScore(
      article,
      this.config.keywords
    );
  }

  // フィルタリングサマリー生成
  public generateFilteringSummary(
    originalCount: number,
    filteredCount: number
  ): string {
    const criteria = {
      keywords: this.config.keywords,
      excludeKeywords: this.config.filtering.excludeKeywords,
      minRelevanceScore: this.config.filtering.minRelevanceScore,
      maxArticlesPerDay: this.config.filtering.maxArticlesPerDay,
    };

    return this.filteringService.generateFilteringSummary(
      originalCount,
      filteredCount,
      criteria
    );
  }
}
