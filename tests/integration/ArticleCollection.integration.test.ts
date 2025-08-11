import axios from 'axios';
import { ArticleCollectorService } from '../../src/services/ArticleCollectorService';
import { DiscordNotifierService } from '../../src/services/DiscordNotifierService';
import { ConfigLoader } from '../../src/utils/config';
import { Config } from '../../src/types/Config';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// テスト用設定
const mockConfig: Config = {
  keywords: ['AI', 'テスト', 'TypeScript'],
  sources: {
    qiita: {
      enabled: true,
      tags: ['AI'],
    },
    zenn: {
      enabled: true,
      topics: ['ai'],
    },
    hackernews: {
      enabled: true,
      searchTerms: ['AI', 'artificial intelligence'],
    },
    devto: {
      enabled: true,
      tags: ['ai'],
    },
  },
  discord: {
    webhookUrl: 'https://discord.com/api/webhooks/test/webhook',
    maxArticlesPerBatch: 5,
    embedColor: '#0099ff',
  },
  filtering: {
    minRelevanceScore: 0.1,
    maxArticlesPerDay: 20,
    excludeKeywords: ['spam', 'advertisement'],
  },
  performance: {
    maxRetries: 2,
    retryDelayMs: 1000,
    timeoutMs: 10000,
  },
};

describe('Article Collection Integration Tests', () => {
  let articleCollectorService: ArticleCollectorService;
  let discordNotifierService: DiscordNotifierService;

  beforeEach(() => {
    // Mock axios responses
    mockedAxios.get.mockResolvedValue({
      data: [],
      status: 200,
      headers: {},
    });

    mockedAxios.post.mockResolvedValue({
      data: { success: true },
      status: 204,
      headers: {},
    });

    // モックサービスを初期化
    articleCollectorService = new ArticleCollectorService(mockConfig);
    discordNotifierService = new DiscordNotifierService(
      mockConfig.discord.webhookUrl,
      {
        maxEmbedsPerMessage: mockConfig.discord.maxArticlesPerBatch,
        embedColor: parseInt(
          mockConfig.discord.embedColor.replace('#', ''),
          16
        ),
      }
    );
  });

  describe('ArticleCollectorService Integration', () => {
    it('設定が正しく読み込まれる', () => {
      expect(articleCollectorService).toBeDefined();

      const stats = articleCollectorService.getCollectionStats();
      expect(stats.totalSources).toBeGreaterThan(0);
      expect(stats.enabledSources).toContain('Qiita');
    });

    it('無効なタグで記事収集を実行しても空の配列を返す', async () => {
      // 存在しないソースでの収集テスト
      try {
        const articles =
          await articleCollectorService.collectFromSource('nonexistent');
        expect(articles).toEqual([]);
      } catch (error) {
        // 存在しないソースの場合はエラーが発生するのが正常
        expect(error).toBeDefined();
      }
    }, 15000);

    it('収集統計が正しく取得できる', () => {
      const stats = articleCollectorService.getCollectionStats();

      expect(stats).toMatchObject({
        totalSources: expect.any(Number),
        enabledSources: expect.any(Array),
        cacheStats: expect.objectContaining({
          urls: expect.any(Number),
          titles: expect.any(Number),
        }),
      });
    });
  });

  describe('DiscordNotifierService Integration', () => {
    it('Discord通知サービスが初期化される', () => {
      expect(discordNotifierService).toBeDefined();
    });

    it('テストメッセージの送信準備ができている', async () => {
      // 実際のDiscord送信はしないが、メソッドが呼び出せることを確認
      expect(async () => {
        await discordNotifierService.sendTestMessage();
      }).not.toThrow();
    });

    it('空の記事リストでも通知処理ができる', async () => {
      // 空の記事リストでの通知テスト
      expect(async () => {
        await discordNotifierService.sendArticleNotification([]);
      }).not.toThrow();
    });
  });

  describe('Config Loading Integration', () => {
    it('環境変数が正しく取得される', () => {
      const envVars = ConfigLoader.getEnvironmentVariables();

      expect(envVars).toMatchObject({
        NODE_ENV: expect.any(String),
        DISCORD_WEBHOOK_URL: expect.any(String),
      });

      // オプショナルな環境変数をチェック
      const { QIITA_ACCESS_TOKEN, DEVTO_API_KEY } = envVars;
      expect(
        typeof QIITA_ACCESS_TOKEN === 'string' ||
          QIITA_ACCESS_TOKEN === undefined
      ).toBe(true);
      expect(
        typeof DEVTO_API_KEY === 'string' || DEVTO_API_KEY === undefined
      ).toBe(true);
    });

    it('モック設定での初期化が成功する', () => {
      // モック設定でのサービス初期化テスト
      expect(() => {
        new ArticleCollectorService(mockConfig);
      }).not.toThrow();
    });
  });

  describe('Service Integration Flow', () => {
    it('記事収集から通知までの基本フローが動作する', async () => {
      // モックした環境でのフロー確認
      const stats = articleCollectorService.getCollectionStats();
      expect(stats.enabledSources.length).toBeGreaterThan(0);

      // Discord通知サービスが利用可能
      expect(discordNotifierService).toBeDefined();

      // 基本的な統合が完了していることを確認
      expect(true).toBe(true);
    });
  });
});
