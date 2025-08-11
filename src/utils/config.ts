import { readFileSync } from 'fs';
import { join } from 'path';
import { Config } from '../types/Config';
import { logger } from './logger';

interface ConfigFile {
  keywords: string[];
  sources: {
    qiita: {
      enabled: boolean;
      tags: string[];
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
      maxArticles?: number;
    };
  };
  discord: {
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

export class ConfigLoader {
  private static readonly CONFIG_FILE_PATH = join(
    process.cwd(),
    'config',
    'keywords.json'
  );

  public static loadConfig(): Config {
    try {
      logger.info('設定ファイル読み込み開始');

      // ファイルから設定を読み込み
      const configFile = this.loadConfigFile();

      // 環境変数と統合
      const config = this.mergeWithEnvironmentVariables(configFile);

      // バリデーション
      this.validateConfig(config);

      logger.info('設定ファイル読み込み完了', {
        enabledSources: this.getEnabledSources(config),
        keywordsCount: config.keywords.length,
      });

      return config;
    } catch (error) {
      logger.error('設定ファイル読み込みでエラー', error);
      throw new Error(`Config loading failed: ${String(error)}`);
    }
  }

  private static loadConfigFile(): ConfigFile {
    try {
      const fileContent = readFileSync(this.CONFIG_FILE_PATH, 'utf8');
      const configFile = JSON.parse(fileContent) as ConfigFile;
      logger.debug('設定ファイル解析完了', { path: this.CONFIG_FILE_PATH });
      return configFile;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new Error(`Config file not found: ${this.CONFIG_FILE_PATH}`);
      }
      throw new Error(`Config file parsing failed: ${String(error)}`);
    }
  }

  private static mergeWithEnvironmentVariables(configFile: ConfigFile): Config {
    const config: Config = {
      keywords: configFile.keywords,
      sources: {
        qiita: {
          ...configFile.sources.qiita,
          ...(process.env.QIITA_ACCESS_TOKEN && {
            accessToken: process.env.QIITA_ACCESS_TOKEN,
          }),
        },
        zenn: configFile.sources.zenn,
        hackernews: configFile.sources.hackernews,
        devto: {
          ...configFile.sources.devto,
          ...(process.env.DEVTO_API_KEY && {
            apiKey: process.env.DEVTO_API_KEY,
          }),
        },
      },
      discord: {
        webhookUrl: this.getRequiredEnvironmentVariable('DISCORD_WEBHOOK_URL'),
        maxArticlesPerBatch: configFile.discord.maxArticlesPerBatch,
        embedColor: this.parseHexColor(configFile.discord.embedColor),
      },
      filtering: configFile.filtering,
      performance: {
        maxRetries: configFile.performance.maxRetries,
        retryDelayMs: configFile.performance.retryDelayMs,
        timeoutMs: configFile.performance.timeoutMs,
      },
    };

    return config;
  }

  private static getRequiredEnvironmentVariable(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }

  private static parseHexColor(colorString: string): string {
    // #RRGGBB 形式から # を除去して返す
    if (colorString.startsWith('#')) {
      return colorString.substring(1);
    }
    return colorString;
  }

  private static validateConfig(config: Config): void {
    // 必須フィールドの検証
    if (!config.keywords || config.keywords.length === 0) {
      throw new Error('Keywords array cannot be empty');
    }

    if (!config.discord.webhookUrl) {
      throw new Error('Discord webhook URL is required');
    }

    // Webhook URL の形式検証
    if (!this.isValidWebhookUrl(config.discord.webhookUrl)) {
      throw new Error('Invalid Discord webhook URL format');
    }

    // 数値の範囲検証
    if (
      config.filtering.minRelevanceScore < 0 ||
      config.filtering.minRelevanceScore > 1
    ) {
      throw new Error('minRelevanceScore must be between 0 and 1');
    }

    if (config.filtering.maxArticlesPerDay < 1) {
      throw new Error('maxArticlesPerDay must be greater than 0');
    }

    // 少なくとも一つのソースが有効になっているかチェック
    const enabledSources = this.getEnabledSources(config);
    if (enabledSources.length === 0) {
      throw new Error('At least one source must be enabled');
    }

    logger.debug('設定ファイルバリデーション完了');
  }

  private static isValidWebhookUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return (
        parsedUrl.hostname === 'discord.com' &&
        parsedUrl.pathname.startsWith('/api/webhooks/')
      );
    } catch {
      return false;
    }
  }

  private static getEnabledSources(config: Config): string[] {
    const sources = [];
    if (config.sources.qiita.enabled) sources.push('qiita');
    if (config.sources.zenn.enabled) sources.push('zenn');
    if (config.sources.hackernews.enabled) sources.push('hackernews');
    if (config.sources.devto.enabled) sources.push('devto');
    return sources;
  }

  // 設定ファイルのサンプルを生成
  public static generateSampleConfig(): ConfigFile {
    return {
      keywords: [
        'AI',
        'machine learning',
        'deep learning',
        'ChatGPT',
        'neural networks',
      ],
      sources: {
        qiita: {
          enabled: true,
          tags: ['AI', '機械学習', 'DeepLearning'],
        },
        zenn: {
          enabled: true,
          topics: ['ai', 'machinelearning', 'deeplearning'],
        },
        hackernews: {
          enabled: true,
          searchTerms: ['AI', 'machine learning', 'ChatGPT'],
        },
        devto: {
          enabled: true,
          tags: ['ai', 'machinelearning', 'deeplearning'],
        },
      },
      discord: {
        maxArticlesPerBatch: 10,
        embedColor: '#00ff7f',
      },
      filtering: {
        minRelevanceScore: 0.3,
        maxArticlesPerDay: 50,
        excludeKeywords: ['advertisement', 'sponsored'],
      },
      performance: {
        maxRetries: 3,
        retryDelayMs: 2000,
        timeoutMs: 15000,
      },
    };
  }

  // 設定の部分更新
  public static updateConfig(updates: Partial<ConfigFile>): Config {
    const currentConfig = this.loadConfigFile();
    const updatedConfigFile = { ...currentConfig, ...updates };

    // 一時的にメモリ内で更新された設定をテスト
    const config = this.mergeWithEnvironmentVariables(updatedConfigFile);
    this.validateConfig(config);

    logger.info('設定の部分更新完了');
    return config;
  }

  // 環境変数の一覧表示
  public static getEnvironmentVariables(): Record<string, string | undefined> {
    return {
      DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL
        ? '[SET]'
        : undefined,
      QIITA_ACCESS_TOKEN: process.env.QIITA_ACCESS_TOKEN ? '[SET]' : undefined,
      DEVTO_API_KEY: process.env.DEVTO_API_KEY ? '[SET]' : undefined,
      NODE_ENV: process.env.NODE_ENV,
    };
  }
}
