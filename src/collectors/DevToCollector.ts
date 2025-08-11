import axios, { AxiosResponse } from 'axios';
import { Article, DevToArticle } from '../types/Article';
import { logger } from '../utils/logger';
import { RetryService } from '../utils/retry';

interface DevToCollectorConfig {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  articlesPerPage: number;
  maxPages: number;
  minReactions: number;
}

export class DevToCollector {
  private config: DevToCollectorConfig;
  private static readonly DEFAULT_CONFIG: DevToCollectorConfig = {
    baseUrl: 'https://dev.to/api',
    timeout: 10000,
    articlesPerPage: 30,
    maxPages: 3,
    minReactions: 5, // 最小リアクション数
  };

  constructor(config: Partial<DevToCollectorConfig> = {}) {
    this.config = { ...DevToCollector.DEFAULT_CONFIG, ...config };
    logger.debug('DevToCollector初期化完了', this.config);
  }

  public async collectArticles(
    tags: string[],
    since?: Date
  ): Promise<Article[]> {
    logger.info(`Dev.to記事収集開始: タグ ${tags.length} 個`);

    try {
      const allArticles: Article[] = [];

      for (const tag of tags) {
        logger.debug(`Dev.toタグ "${tag}" の記事を収集中...`);

        const tagArticles = await RetryService.withRetryCondition(
          () => this.fetchArticlesByTag(tag, since),
          RetryService.createHttpRetryCondition(),
          { maxRetries: 3, baseDelay: 1000 },
          `Dev.to tag "${tag}" collection`
        );

        allArticles.push(...tagArticles);
        logger.debug(`タグ "${tag}": ${tagArticles.length} 記事を収集`);

        // API Rate limit対策で少し待機
        await this.sleep(300);
      }

      const uniqueArticles = this.removeDuplicatesByUrl(allArticles);

      logger.info(
        `Dev.to記事収集完了: ${uniqueArticles.length} 記事 ` +
          `(重複除外前: ${allArticles.length} 記事)`
      );

      return uniqueArticles;
    } catch (error) {
      logger.error('Dev.to記事収集でエラーが発生', error);
      throw error;
    }
  }

  private async fetchArticlesByTag(
    tag: string,
    since?: Date
  ): Promise<Article[]> {
    const articles: Article[] = [];

    for (let page = 1; page <= this.config.maxPages; page++) {
      try {
        const params: Record<string, string | number> = {
          tag: tag,
          per_page: this.config.articlesPerPage,
          page: page,
          state: 'fresh', // 新しい記事を優先
        };

        // 人気記事も取得（top パラメータ使用）
        if (page === 1) {
          // 最初のページは人気記事も含める
          delete params.state;
          params.top = '7'; // 過去7日間の人気記事
        }

        logger.debug(
          `Dev.to API呼び出し: タグ "${tag}" ページ ${page}`,
          params
        );

        const response = await this.callDevToAPI('/articles', params);

        if (!response.data || response.data.length === 0) {
          logger.debug(`タグ "${tag}" のページ ${page}: 記事が見つかりません`);
          break;
        }

        const pageArticles = response.data
          .filter((item: DevToArticle) => this.isValidArticle(item, since))
          .map((item: DevToArticle) => this.transformToArticle(item))
          .filter(
            article =>
              article.score && article.score >= this.config.minReactions
          );

        articles.push(...pageArticles);

        logger.debug(
          `タグ "${tag}" のページ ${page}: ${pageArticles.length} 記事を追加 ` +
            `(フィルタ前: ${response.data.length})`
        );

        // 最後のページかチェック
        if (response.data.length < this.config.articlesPerPage) {
          break;
        }

        // API Rate limit対策
        if (page < this.config.maxPages) {
          await this.sleep(200);
        }
      } catch (error) {
        logger.warn(`タグ "${tag}" のページ ${page} で取得エラー`, error);
        break;
      }
    }

    return articles;
  }

  private async callDevToAPI(
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<AxiosResponse<DevToArticle[]>> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'User-Agent': 'AI-Article-Bot/1.0',
    };

    if (this.config.apiKey) {
      headers['api-key'] = this.config.apiKey;
    }

    logger.debug(`Dev.to API呼び出し: ${url}`, { params });

    const response = await axios.get<DevToArticle[]>(url, {
      headers,
      params,
      timeout: this.config.timeout,
    });

    // Rate limit情報をログ出力
    if (response.headers['x-ratelimit-remaining']) {
      const remaining = response.headers['x-ratelimit-remaining'];
      logger.debug(`Dev.to API残り回数: ${remaining}`);

      if (parseInt(remaining) < 10) {
        logger.warn('Dev.to APIの残り回数が少なくなっています');
      }
    }

    return response;
  }

  private isValidArticle(article: DevToArticle, since?: Date): boolean {
    // 必須フィールドチェック
    if (!article.title || !article.url || !article.published_at) {
      return false;
    }

    // 日付フィルタリング
    if (since) {
      const publishedAt = new Date(article.published_at);
      if (publishedAt < since) {
        return false;
      }
    }

    // 削除された記事でないかチェック
    if (article.title.toLowerCase().includes('[deleted]')) {
      return false;
    }

    return true;
  }

  public transformToArticle(devtoArticle: DevToArticle): Article {
    try {
      return {
        id: `devto-${devtoArticle.id}`,
        title: devtoArticle.title.trim(),
        url: devtoArticle.url,
        author: devtoArticle.user.name || devtoArticle.user.username,
        publishedAt: new Date(devtoArticle.published_at),
        source: 'devto',
        tags: devtoArticle.tag_list || [],
        excerpt: this.extractExcerpt(devtoArticle.description),
        score: devtoArticle.positive_reactions_count || 0,
        relevanceScore: 0, // フィルタリング段階で算出される
      };
    } catch (error) {
      logger.error('Dev.to記事変換でエラー', { article: devtoArticle, error });
      throw new Error(`Failed to transform Dev.to article: ${String(error)}`);
    }
  }

  private extractExcerpt(description: string, maxLength = 200): string {
    if (!description) return '';

    // HTMLタグを除去してクリーンアップ
    const cleaned = description
      .replace(/<[^>]*>/g, '') // HTML タグ除去
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // 連続する空白を単一に
      .trim();

    return cleaned.length > maxLength
      ? cleaned.substring(0, maxLength) + '...'
      : cleaned;
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

  public getConfig(): DevToCollectorConfig {
    return { ...this.config };
  }

  public setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    logger.info('Dev.to APIキーが設定されました');
  }

  // 記事の詳細情報を取得（オプション機能）
  public async getArticleDetails(
    articleId: number
  ): Promise<DevToArticle | null> {
    try {
      logger.debug(`Dev.to記事詳細取得: ${articleId}`);

      const response = await RetryService.withRetry(
        async () => {
          const res = await this.callDevToAPI(`/articles/${articleId}`, {});
          return res;
        },
        { maxRetries: 2, baseDelay: 1000 },
        `Dev.to article ${articleId} details`
      );

      return response.data as DevToArticle;
    } catch (error) {
      logger.warn(`記事 ${articleId} の詳細取得でエラー`, error);
      return null;
    }
  }

  // ユーザーの記事を取得（オプション機能）
  public async getArticlesByUser(username: string): Promise<Article[]> {
    try {
      logger.debug(`Dev.toユーザー "${username}" の記事を取得中`);

      const response = await this.callDevToAPI(`/articles`, {
        username: username,
        per_page: this.config.articlesPerPage,
      });

      return response.data
        .filter(item => this.isValidArticle(item))
        .map(item => this.transformToArticle(item));
    } catch (error) {
      logger.error(`ユーザー "${username}" の記事取得でエラー`, error);
      return [];
    }
  }

  // AI関連の人気タグ一覧
  public static getAIRelatedTags(): string[] {
    return [
      'ai',
      'machinelearning',
      'artificialintelligence',
      'deeplearning',
      'neuralnetworks',
      'chatgpt',
      'openai',
      'nlp',
      'computervision',
      'tensorflow',
      'pytorch',
      'datascience',
      'python',
      'ml',
      'algorithms',
      'automation',
      'robotics',
      'bigdata',
      'analytics',
      'statistics',
    ];
  }

  // 技術系の人気タグ一覧
  public static getPopularTechTags(): string[] {
    return [
      'javascript',
      'typescript',
      'python',
      'react',
      'nodejs',
      'vue',
      'angular',
      'docker',
      'kubernetes',
      'aws',
      'webdev',
      'programming',
      'tutorial',
      'beginners',
      'opensource',
      'devops',
      'backend',
      'frontend',
      'fullstack',
      'api',
    ];
  }
}
