import { Article } from '../types/Article';
import { logger } from './logger';

interface FilteringCriteria {
  keywords: string[];
  excludeKeywords: string[];
  minRelevanceScore: number;
  maxArticlesPerDay: number;
}

interface KeywordWeight {
  keyword: string;
  weight: number;
}

export class FilteringService {
  private static readonly AI_KEYWORDS: KeywordWeight[] = [
    // 高重要度キーワード
    { keyword: 'chatgpt', weight: 1.0 },
    { keyword: 'gpt', weight: 1.0 },
    { keyword: 'openai', weight: 1.0 },
    { keyword: 'claude', weight: 1.0 },
    { keyword: 'llm', weight: 1.0 },
    { keyword: '大規模言語モデル', weight: 1.0 },
    { keyword: 'transformer', weight: 0.9 },
    { keyword: 'bert', weight: 0.9 },

    // 中程度重要度キーワード
    { keyword: 'ai', weight: 0.8 },
    { keyword: '人工知能', weight: 0.8 },
    { keyword: 'machine learning', weight: 0.8 },
    { keyword: '機械学習', weight: 0.8 },
    { keyword: 'deep learning', weight: 0.8 },
    { keyword: 'ディープラーニング', weight: 0.8 },
    { keyword: 'neural network', weight: 0.7 },
    { keyword: 'ニューラルネットワーク', weight: 0.7 },

    // 特定分野キーワード
    { keyword: 'nlp', weight: 0.6 },
    { keyword: '自然言語処理', weight: 0.6 },
    { keyword: 'computer vision', weight: 0.6 },
    { keyword: '画像認識', weight: 0.6 },
    { keyword: '画像生成', weight: 0.6 },
    { keyword: 'stable diffusion', weight: 0.7 },
    { keyword: 'midjourney', weight: 0.7 },
    { keyword: 'dalle', weight: 0.7 },

    // 技術キーワード
    { keyword: 'pytorch', weight: 0.5 },
    { keyword: 'tensorflow', weight: 0.5 },
    { keyword: 'huggingface', weight: 0.5 },
    { keyword: 'rag', weight: 0.6 },
    { keyword: 'fine-tuning', weight: 0.5 },
    { keyword: 'embedding', weight: 0.5 },
  ];

  public filterArticles(
    articles: Article[],
    criteria: FilteringCriteria
  ): Article[] {
    logger.info(`記事フィルタリング開始: ${articles.length}件の記事`);

    // Step 1: 関連度スコア算出
    const articlesWithScore = articles.map(article => ({
      ...article,
      relevanceScore: this.calculateRelevanceScore(article, criteria.keywords),
    }));

    // Step 2: 除外キーワードフィルタリング
    const notExcluded = articlesWithScore.filter(
      article =>
        !this.containsExcludeKeywords(article, criteria.excludeKeywords)
    );

    // Step 3: 最小関連度スコアフィルタリング
    const relevant = notExcluded.filter(
      article => article.relevanceScore >= criteria.minRelevanceScore
    );

    // Step 4: 関連度スコア順でソート
    const sorted = relevant.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Step 5: 記事数制限適用
    const limited = sorted.slice(0, criteria.maxArticlesPerDay);

    logger.info(
      `フィルタリング完了: ${limited.length}件が選択 ` +
        `(除外: ${articles.length - notExcluded.length}件, ` +
        `低関連度: ${notExcluded.length - relevant.length}件, ` +
        `制限適用: ${relevant.length - limited.length}件)`
    );

    return limited;
  }

  public calculateRelevanceScore(
    article: Article,
    customKeywords: string[] = []
  ): number {
    const text =
      `${article.title} ${article.excerpt || ''} ${article.tags.join(' ')}`.toLowerCase();

    let score = 0;
    let matchCount = 0;

    // AI関連キーワードでのスコア算出
    for (const item of FilteringService.AI_KEYWORDS) {
      if (text.includes(item.keyword.toLowerCase())) {
        score += item.weight;
        matchCount++;
      }
    }

    // カスタムキーワードでのスコア算出（重み 0.5）
    for (const keyword of customKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 0.5;
        matchCount++;
      }
    }

    // タイトルでのマッチは追加ボーナス
    const titleText = article.title.toLowerCase();
    let titleBonus = 0;
    for (const item of FilteringService.AI_KEYWORDS) {
      if (titleText.includes(item.keyword.toLowerCase())) {
        titleBonus += item.weight * 0.3; // 30%のボーナス
      }
    }

    // タグでのマッチも追加ボーナス
    let tagBonus = 0;
    for (const tag of article.tags) {
      const tagText = tag.toLowerCase();
      for (const item of FilteringService.AI_KEYWORDS) {
        if (tagText.includes(item.keyword.toLowerCase())) {
          tagBonus += item.weight * 0.2; // 20%のボーナス
        }
      }
    }

    // 記事の人気度によるボーナス（存在する場合）
    let popularityBonus = 0;
    if (article.score) {
      if (article.score > 100) popularityBonus = 0.2;
      else if (article.score > 50) popularityBonus = 0.1;
      else if (article.score > 20) popularityBonus = 0.05;
    }

    // 最終スコア算出（正規化）
    const finalScore = Math.min(
      1.0,
      (score + titleBonus + tagBonus + popularityBonus) / 3
    );

    logger.debug(
      `関連度スコア算出: ${article.title.substring(0, 50)}... ` +
        `スコア: ${finalScore.toFixed(3)} (マッチ: ${matchCount}個, ` +
        `タイトルボーナス: ${titleBonus.toFixed(3)}, ` +
        `タグボーナス: ${tagBonus.toFixed(3)}, ` +
        `人気度ボーナス: ${popularityBonus.toFixed(3)})`
    );

    return finalScore;
  }

  private containsExcludeKeywords(
    article: Article,
    excludeKeywords: string[]
  ): boolean {
    if (excludeKeywords.length === 0) return false;

    const text =
      `${article.title} ${article.excerpt || ''} ${article.tags.join(' ')}`.toLowerCase();

    for (const keyword of excludeKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        logger.debug(
          `除外キーワード "${keyword}" により記事を除外: ${article.title}`
        );
        return true;
      }
    }

    return false;
  }

  public getArticlesBySource(articles: Article[]): Record<string, Article[]> {
    const result: Record<string, Article[]> = {};

    for (const article of articles) {
      if (!result[article.source]) {
        result[article.source] = [];
      }
      result[article.source].push(article);
    }

    return result;
  }

  public getTopArticles(articles: Article[], count: number): Article[] {
    return articles
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, count);
  }

  public getArticlesByDateRange(
    articles: Article[],
    startDate: Date,
    endDate: Date
  ): Article[] {
    return articles.filter(article => {
      const publishedAt = article.publishedAt;
      return publishedAt >= startDate && publishedAt <= endDate;
    });
  }

  public generateFilteringSummary(
    originalCount: number,
    filteredCount: number,
    criteria: FilteringCriteria
  ): string {
    const reductionRate = (
      ((originalCount - filteredCount) / originalCount) *
      100
    ).toFixed(1);

    return `
📊 フィルタリング結果サマリー
・元記事数: ${originalCount}件
・フィルタ後: ${filteredCount}件 (${reductionRate}%削減)
・最小関連度: ${criteria.minRelevanceScore}
・最大記事数: ${criteria.maxArticlesPerDay}
・除外キーワード: ${criteria.excludeKeywords.length}個
    `.trim();
  }

  public static getDefaultKeywords(): string[] {
    return FilteringService.AI_KEYWORDS.map(item => item.keyword);
  }
}
