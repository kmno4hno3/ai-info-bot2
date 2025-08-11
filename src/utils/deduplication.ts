import { Article } from '../types/Article';
import { logger } from './logger';

interface ArticleHash {
  url: string;
  title: string;
  normalizedTitle: string;
}

export class DeduplicationService {
  private seenUrls: Set<string> = new Set();
  private seenTitles: Set<string> = new Set();

  public deduplicateArticles(articles: Article[]): Article[] {
    logger.info(`記事重複除外処理開始: ${articles.length}件の記事`);

    const uniqueArticles: Article[] = [];
    const duplicateCount = { url: 0, title: 0 };

    for (const article of articles) {
      const hash = this.createArticleHash(article);

      // URL重複チェック
      if (this.seenUrls.has(hash.url)) {
        duplicateCount.url++;
        logger.debug(`URL重複により除外: ${hash.url}`);
        continue;
      }

      // タイトル重複チェック（正規化後）
      if (this.seenTitles.has(hash.normalizedTitle)) {
        duplicateCount.title++;
        logger.debug(`タイトル重複により除外: ${hash.title}`);
        continue;
      }

      // 重複なしの場合、セットに追加して結果に含める
      this.seenUrls.add(hash.url);
      this.seenTitles.add(hash.normalizedTitle);
      uniqueArticles.push(article);
    }

    logger.info(
      `重複除外完了: ${uniqueArticles.length}件が残存 (URL重複: ${duplicateCount.url}件, タイトル重複: ${duplicateCount.title}件)`
    );

    return uniqueArticles;
  }

  private createArticleHash(article: Article): ArticleHash {
    return {
      url: this.normalizeUrl(article.url),
      title: article.title,
      normalizedTitle: this.normalizeTitle(article.title),
    };
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // クエリパラメータを除去（tracking parameterなど）
      const paramsToRemove = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'ref',
        'source',
      ];
      paramsToRemove.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      // 末尾のスラッシュを統一
      let pathname = urlObj.pathname;
      if (pathname !== '/' && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      urlObj.pathname = pathname;

      return urlObj.toString();
    } catch (error) {
      logger.warn(`URL正規化に失敗: ${url}`, error);
      return url;
    }
  }

  private normalizeTitle(title: string): string {
    return (
      title
        .toLowerCase()
        .trim()
        // 全角・半角の統一
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, char =>
          String.fromCharCode(char.charCodeAt(0) - 0xfee0)
        )
        // 空白文字の統一
        .replace(/\s+/g, ' ')
        // 特殊文字の除去
        .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '')
        // 年月日の正規化
        .replace(/\d{4}[年\/\-]\d{1,2}[月\/\-]\d{1,2}[日]?/g, 'YYYY-MM-DD')
        // バージョン番号の正規化
        .replace(/v?\d+\.\d+(\.\d+)?/g, 'vX.X.X')
    );
  }

  public isSimilarTitle(
    title1: string,
    title2: string,
    threshold = 0.8
  ): boolean {
    const normalized1 = this.normalizeTitle(title1);
    const normalized2 = this.normalizeTitle(title2);

    if (normalized1 === normalized2) {
      return true;
    }

    // Levenshtein距離による類似度計算
    const similarity = this.calculateSimilarity(normalized1, normalized2);
    return similarity >= threshold;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Dynamic programming matrix
    const matrix: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= len1; i++) {
      matrix[i]![0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0]![j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        const prevRow = matrix[i - 1]!;
        const currentRow = matrix[i]!;
        const prevRowJ = prevRow[j] ?? 0;
        const currentRowJMinus1 = currentRow[j - 1] ?? 0;
        const prevRowJMinus1 = prevRow[j - 1] ?? 0;

        currentRow[j] = Math.min(
          prevRowJ + 1, // deletion
          currentRowJMinus1 + 1, // insertion
          prevRowJMinus1 + cost // substitution
        );
      }
    }

    const distance = matrix[len1]![len2] ?? 0;
    const maxLength = Math.max(len1, len2);
    return 1 - distance / maxLength;
  }

  public clearCache(): void {
    this.seenUrls.clear();
    this.seenTitles.clear();
    logger.debug('重複除外キャッシュをクリアしました');
  }

  public getCacheStats(): { urls: number; titles: number } {
    return {
      urls: this.seenUrls.size,
      titles: this.seenTitles.size,
    };
  }
}
