import axios, { AxiosResponse } from 'axios';
import { Article, QiitaArticle } from '../types/Article';
import { logger } from '../utils/logger';
import { RetryService } from '../utils/retry';

interface QiitaCollectorConfig {
  accessToken?: string;
  baseUrl: string;
  itemsPerPage: number;
  maxPages: number;
}

export class QiitaCollector {
  private config: QiitaCollectorConfig;
  private static readonly DEFAULT_CONFIG: QiitaCollectorConfig = {
    baseUrl: 'https://qiita.com/api/v2',
    itemsPerPage: 100,
    maxPages: 3,
  };

  constructor(config: Partial<QiitaCollectorConfig> = {}) {
    this.config = { ...QiitaCollector.DEFAULT_CONFIG, ...config };
    logger.debug('QiitaCollector初期化完了', this.config);
  }

  public async collectArticles(
    tags: string[],
    since?: Date
  ): Promise<Article[]> {
    logger.info(`Qiita記事収集開始: タグ ${tags.length} 個`);

    try {
      const allArticles: Article[] = [];

      for (const tag of tags) {
        logger.debug(`Qiitaタグ "${tag}" の記事を収集中...`);

        const tagArticles = await RetryService.withRetryCondition(
          () => this.fetchArticlesByTag(tag, since),
          RetryService.createHttpRetryCondition(),
          { maxRetries: 3, baseDelay: 2000 },
          `Qiita tag "${tag}" collection`
        );

        allArticles.push(...tagArticles);
        logger.debug(`タグ "${tag}": ${tagArticles.length} 記事を収集`);

        // API Rate limit対策で少し待機
        await this.sleep(200);
      }

      const uniqueArticles = this.removeDuplicatesByUrl(allArticles);

      logger.info(
        `Qiita記事収集完了: ${uniqueArticles.length} 記事 ` +
          `(重複除外前: ${allArticles.length} 記事)`
      );

      return uniqueArticles;
    } catch (error) {
      logger.error('Qiita記事収集でエラーが発生', error);
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
        const response = await this.callQiitaAPI('/items', {
          query: `tag:${tag}`,
          per_page: this.config.itemsPerPage,
          page: page,
          sort: 'created',
        });

        if (!response.data || response.data.length === 0) {
          logger.debug(`タグ "${tag}" のページ ${page}: 記事が見つかりません`);
          break;
        }

        const pageArticles = response.data
          .map((item: QiitaArticle) => this.transformToArticle(item))
          .filter(article => this.isArticleRecentEnough(article, since));

        articles.push(...pageArticles);

        logger.debug(
          `タグ "${tag}" のページ ${page}: ${pageArticles.length} 記事を追加`
        );

        // 最後のページかチェック
        if (response.data.length < this.config.itemsPerPage) {
          break;
        }

        // API Rate limit対策
        if (page < this.config.maxPages) {
          await this.sleep(100);
        }
      } catch (error) {
        logger.warn(`タグ "${tag}" のページ ${page} で取得エラー`, error);
        break;
      }
    }

    return articles;
  }

  private async callQiitaAPI(
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<AxiosResponse<QiitaArticle[]>> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'User-Agent': 'AI-Article-Bot/1.0',
    };

    if (this.config.accessToken) {
      headers.Authorization = `Bearer ${this.config.accessToken}`;
    }

    logger.debug(`Qiita API呼び出し: ${url}`, { params });

    const response = await axios.get<QiitaArticle[]>(url, {
      headers,
      params,
      timeout: 10000,
    });

    // Rate limit情報をログ出力
    if (response.headers['rate-limit-remaining']) {
      const remaining = response.headers['rate-limit-remaining'];
      logger.debug(`Qiita API残り回数: ${remaining}`);

      if (parseInt(remaining) < 10) {
        logger.warn('Qiita APIの残り回数が少なくなっています');
      }
    }

    return response;
  }

  public transformToArticle(qiitaArticle: QiitaArticle): Article {
    try {
      return {
        id: `qiita-${qiitaArticle.id}`,
        title: qiitaArticle.title,
        url: qiitaArticle.url,
        author: qiitaArticle.user.name || qiitaArticle.user.id,
        publishedAt: new Date(qiitaArticle.created_at),
        source: 'qiita',
        tags: qiitaArticle.tags.map(tag => tag.name),
        excerpt: this.extractExcerpt(qiitaArticle.body),
        score: qiitaArticle.likes_count + qiitaArticle.stocks_count,
        relevanceScore: 0, // フィルタリング段階で算出される
      };
    } catch (error) {
      logger.error('Qiita記事変換でエラー', { article: qiitaArticle, error });
      throw new Error(`Failed to transform Qiita article: ${String(error)}`);
    }
  }

  private extractExcerpt(body: string, maxLength = 200): string {
    if (!body) return '';

    // Markdownの記法を除去
    const cleaned = body
      .replace(/#{1,6}\s+/g, '') // ヘッダー
      .replace(/\*\*(.*?)\*\*/g, '$1') // 太字
      .replace(/\*(.*?)\*/g, '$1') // 斜体
      .replace(/`(.*?)`/g, '$1') // インラインコード
      .replace(/```[\s\S]*?```/g, '[コードブロック]') // コードブロック
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // リンク
      .replace(/\n+/g, ' ') // 改行を空白に
      .trim();

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

  public getConfig(): QiitaCollectorConfig {
    return { ...this.config };
  }

  public setAccessToken(token: string): void {
    this.config.accessToken = token;
    logger.info('Qiita アクセストークンが設定されました');
  }
}
