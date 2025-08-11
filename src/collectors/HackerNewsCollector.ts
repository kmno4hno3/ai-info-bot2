import axios from 'axios';
import { Article, HackerNewsArticle } from '../types/Article';
import { logger } from '../utils/logger';
import { RetryService } from '../utils/retry';

interface HackerNewsCollectorConfig {
  algoliaUrl: string;
  itemApiUrl: string;
  timeout: number;
  hitsPerPage: number;
  maxPages: number;
  minScore: number;
}

interface AlgoliaResponse {
  hits: HackerNewsArticle[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
}

export class HackerNewsCollector {
  private config: HackerNewsCollectorConfig;
  private static readonly DEFAULT_CONFIG: HackerNewsCollectorConfig = {
    algoliaUrl: 'https://hn.algolia.com/api/v1/search',
    itemApiUrl: 'https://hacker-news.firebaseio.com/v0/item',
    timeout: 15000,
    hitsPerPage: 50,
    maxPages: 3,
    minScore: 10, // 最小スコア（ポイント数）
  };

  constructor(config: Partial<HackerNewsCollectorConfig> = {}) {
    this.config = { ...HackerNewsCollector.DEFAULT_CONFIG, ...config };
    logger.debug('HackerNewsCollector初期化完了', this.config);
  }

  public async collectArticles(
    searchTerms: string[],
    since?: Date
  ): Promise<Article[]> {
    logger.info(`HackerNews記事収集開始: 検索語 ${searchTerms.length} 個`);

    try {
      const allArticles: Article[] = [];

      for (const term of searchTerms) {
        logger.debug(`HackerNews検索語 "${term}" の記事を収集中...`);

        const termArticles = await RetryService.withRetryCondition(
          () => this.searchHackerNews(term, since),
          RetryService.createHttpRetryCondition(),
          { maxRetries: 3, baseDelay: 2000 },
          `HackerNews search "${term}"`
        );

        allArticles.push(...termArticles);
        logger.debug(`検索語 "${term}": ${termArticles.length} 記事を収集`);

        // API Rate limit対策で少し待機
        await this.sleep(500);
      }

      const uniqueArticles = this.removeDuplicatesByUrl(allArticles);

      logger.info(
        `HackerNews記事収集完了: ${uniqueArticles.length} 記事 ` +
          `(重複除外前: ${allArticles.length} 記事)`
      );

      return uniqueArticles;
    } catch (error) {
      logger.error('HackerNews記事収集でエラーが発生', error);
      throw error;
    }
  }

  private async searchHackerNews(
    searchTerm: string,
    since?: Date
  ): Promise<Article[]> {
    const articles: Article[] = [];

    for (let page = 0; page < this.config.maxPages; page++) {
      try {
        const params: Record<string, string | number> = {
          query: searchTerm,
          tags: 'story', // ストーリーのみ（コメントは除外）
          hitsPerPage: this.config.hitsPerPage,
          page: page,
          numericFilters: 'points>5', // 5ポイント以上の記事のみ
        };

        // 日付フィルターを追加（過去30日など）
        if (since) {
          const sinceTimestamp = Math.floor(since.getTime() / 1000);
          params.numericFilters = `points>5,created_at_i>${sinceTimestamp}`;
        }

        logger.debug(`HackerNews Algolia API呼び出し: ページ ${page}`, params);

        const response = await axios.get<AlgoliaResponse>(
          this.config.algoliaUrl,
          {
            params,
            timeout: this.config.timeout,
            headers: {
              'User-Agent': 'AI-Article-Bot/1.0',
            },
          }
        );

        if (!response.data.hits || response.data.hits.length === 0) {
          logger.debug(`検索語 "${searchTerm}" のページ ${page}: 結果なし`);
          break;
        }

        const pageArticles = response.data.hits
          .filter(hit => this.isValidHit(hit))
          .map(hit => this.transformToArticle(hit))
          .filter(
            article => article.score && article.score >= this.config.minScore
          );

        articles.push(...pageArticles);

        logger.debug(
          `検索語 "${searchTerm}" のページ ${page}: ${pageArticles.length} 記事を追加 ` +
            `(フィルタ前: ${response.data.hits.length})`
        );

        // 最終ページかチェック
        if (response.data.hits.length < this.config.hitsPerPage) {
          break;
        }

        // API Rate limit対策
        if (page < this.config.maxPages - 1) {
          await this.sleep(200);
        }
      } catch (error) {
        logger.warn(
          `検索語 "${searchTerm}" のページ ${page} で検索エラー`,
          error
        );
        break;
      }
    }

    return articles;
  }

  private isValidHit(hit: HackerNewsArticle): boolean {
    // 必要なフィールドがあるかチェック
    if (!hit.title || !hit.objectID) {
      return false;
    }

    // URLまたは HackerNews の内容があるかチェック
    if (!hit.url && !hit.objectID) {
      return false;
    }

    // 削除されたアイテムでないかチェック
    if (hit.title === '[deleted]' || hit.title === '[dead]') {
      return false;
    }

    return true;
  }

  public async getStoryDetails(storyId: string): Promise<Article | null> {
    try {
      logger.debug(`HackerNews ストーリー詳細取得: ${storyId}`);

      const response = await RetryService.withRetry(
        async () => {
          const res = await axios.get(
            `${this.config.itemApiUrl}/${storyId}.json`,
            {
              timeout: this.config.timeout,
              headers: {
                'User-Agent': 'AI-Article-Bot/1.0',
              },
            }
          );
          return res;
        },
        { maxRetries: 2, baseDelay: 1000 },
        `HackerNews story ${storyId} details`
      );

      if (!response.data) {
        logger.warn(`ストーリー ${storyId} の詳細が見つかりません`);
        return null;
      }

      // Firebase API レスポンスを Algolia 形式に変換
      const algoliaFormat: HackerNewsArticle = {
        objectID: response.data.id?.toString() || storyId,
        title: response.data.title || '',
        url:
          response.data.url ||
          `https://news.ycombinator.com/item?id=${storyId}`,
        author: response.data.by || 'Unknown',
        created_at: new Date(response.data.time * 1000).toISOString(),
        points: response.data.score || 0,
        num_comments: response.data.descendants || 0,
      };

      return this.transformToArticle(algoliaFormat);
    } catch (error) {
      logger.warn(`ストーリー ${storyId} の詳細取得でエラー`, error);
      return null;
    }
  }

  private transformToArticle(hit: HackerNewsArticle): Article {
    try {
      // URL が存在しない場合は HackerNews のページを使用
      const url =
        hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;

      // 作成日時をパース
      let publishedAt: Date;
      try {
        publishedAt = new Date(hit.created_at);
        if (isNaN(publishedAt.getTime())) {
          publishedAt = new Date(); // フォールバック
        }
      } catch {
        publishedAt = new Date();
      }

      // タイトルをクリーンアップ
      const title = this.cleanTitle(hit.title);

      return {
        id: `hackernews-${hit.objectID}`,
        title,
        url,
        author: hit.author || 'Unknown',
        publishedAt,
        source: 'hackernews',
        tags: this.extractTags(title, url),
        excerpt: this.generateExcerpt(title, url),
        score: hit.points || 0,
        relevanceScore: 0, // フィルタリング段階で算出される
      };
    } catch (error) {
      logger.error('HackerNews記事変換でエラー', { hit, error });
      throw new Error(
        `Failed to transform HackerNews article: ${String(error)}`
      );
    }
  }

  private cleanTitle(title: string): string {
    if (!title) return '';

    return (
      title
        .trim()
        // HTML エンティティをデコード
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // 不要な接頭語を削除
        .replace(/^(Show HN|Ask HN|Tell HN):\s*/i, '')
    );
  }

  private extractTags(title: string, url: string): string[] {
    const tags: string[] = [];
    const titleLower = title.toLowerCase();
    const urlLower = url.toLowerCase();

    // タイトルから技術キーワードを抽出
    const techKeywords = [
      'ai',
      'machine learning',
      'deep learning',
      'neural network',
      'chatgpt',
      'gpt',
      'openai',
      'llm',
      'transformer',
      'python',
      'javascript',
      'typescript',
      'go',
      'rust',
      'react',
      'vue',
      'node',
      'docker',
      'kubernetes',
      'aws',
      'gcp',
      'azure',
      'github',
    ];

    for (const keyword of techKeywords) {
      if (titleLower.includes(keyword) || urlLower.includes(keyword)) {
        tags.push(keyword);
      }
    }

    // Show HN, Ask HN などの特別なタグ
    if (/^show hn/i.test(title)) tags.push('Show HN');
    if (/^ask hn/i.test(title)) tags.push('Ask HN');
    if (/^tell hn/i.test(title)) tags.push('Tell HN');

    return [...new Set(tags)]; // 重複除去
  }

  private generateExcerpt(title: string, url: string): string {
    // HackerNews はタイトルベースなので、タイトルから要約を生成
    const domain = this.extractDomain(url);
    const excerpt = `${title}`;

    return domain && domain !== 'news.ycombinator.com'
      ? `${excerpt} (${domain})`
      : excerpt;
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
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

  public getConfig(): HackerNewsCollectorConfig {
    return { ...this.config };
  }

  // AI関連の検索語を取得
  public static getAISearchTerms(): string[] {
    return [
      'artificial intelligence',
      'AI',
      'machine learning',
      'deep learning',
      'neural networks',
      'ChatGPT',
      'GPT',
      'OpenAI',
      'LLM',
      'large language model',
      'transformer',
      'NLP',
      'natural language processing',
      'computer vision',
      'reinforcement learning',
      'PyTorch',
      'TensorFlow',
    ];
  }
}
