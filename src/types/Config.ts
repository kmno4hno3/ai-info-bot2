export interface Config {
  keywords: string[];
  sources: {
    qiita: {
      enabled: boolean;
      tags: string[];
      accessToken?: string;
      maxArticles?: number;
    };
    zenn: {
      enabled: boolean;
      topics: string[];
      maxArticles?: number;
    };
    hackernews: {
      enabled: boolean;
      searchTerms: string[];
      maxArticles?: number;
    };
    devto: {
      enabled: boolean;
      tags: string[];
      apiKey?: string;
      maxArticles?: number;
    };
  };
  discord: {
    webhookUrl: string;
    channelId?: string;
    maxArticlesPerBatch: number;
    embedColor: string;
  };
  filtering: {
    minRelevanceScore: number;
    maxArticlesPerDay: number;
    excludeKeywords: string[];
  };
  performance: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
  };
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  backoffMultiplier: number;
}

export interface LoggerConfig {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  maskSensitiveData: boolean;
}
