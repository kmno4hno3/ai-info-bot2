import { QiitaCollector } from '../../../src/collectors/QiitaCollector';
import { QiitaArticle } from '../../../src/types/Article';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('QiitaCollector', () => {
  let collector: QiitaCollector;

  beforeEach(() => {
    collector = new QiitaCollector();
    jest.clearAllMocks();
  });

  describe('collectArticles', () => {
    it('正常なレスポンスで記事を正しく変換する', async () => {
      const mockResponse = {
        data: [
          {
            id: 'test-id-1',
            title: 'AI技術の最新動向',
            url: 'https://qiita.com/test/items/test-id-1',
            user: { id: 'test-user', name: 'テストユーザー' },
            created_at: '2024-01-15T10:00:00+09:00',
            updated_at: '2024-01-15T10:00:00+09:00',
            tags: [
              { name: 'AI', versions: [] },
              { name: '機械学習', versions: [] },
            ],
            body: 'AI技術について解説します。',
            likes_count: 10,
            comments_count: 5,
            stocks_count: 3,
          },
        ] as QiitaArticle[],
        headers: {},
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const articles = await collector.collectArticles(['AI']);

      expect(articles).toHaveLength(1);
      expect(articles[0]).toMatchObject({
        id: 'qiita-test-id-1',
        title: 'AI技術の最新動向',
        url: 'https://qiita.com/test/items/test-id-1',
        author: 'テストユーザー',
        source: 'qiita',
        tags: ['AI', '機械学習'],
        score: 13, // likes_count + stocks_count
      });
      expect(articles[0]?.publishedAt).toBeInstanceOf(Date);
    });

    it('空のレスポンスを適切に処理する', async () => {
      mockedAxios.get.mockResolvedValue({ data: [], headers: {} });

      const articles = await collector.collectArticles(['NonExistentTag']);

      expect(articles).toHaveLength(0);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/items'),
        expect.objectContaining({
          params: expect.objectContaining({
            query: 'tag:NonExistentTag',
          }),
        })
      );
    });

    it('APIエラー時に適切にハンドリングする', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      // 個別ページでのエラーは空配列を返す（ログに警告が出力される）
      const articles = await collector.collectArticles(['AI']);
      expect(articles).toEqual([]);
    });

    it('複数のタグで記事を収集する', async () => {
      const mockResponse1 = {
        data: [
          {
            id: 'ai-article',
            title: 'AI記事',
            url: 'https://qiita.com/test/items/ai-article',
            user: { id: 'user1', name: 'User1' },
            created_at: '2024-01-15T10:00:00+09:00',
            updated_at: '2024-01-15T10:00:00+09:00',
            tags: [{ name: 'AI', versions: [] }],
            body: 'AI について',
            likes_count: 5,
            comments_count: 2,
            stocks_count: 1,
          },
        ] as QiitaArticle[],
        headers: {},
      };

      const mockResponse2 = {
        data: [
          {
            id: 'ml-article',
            title: '機械学習記事',
            url: 'https://qiita.com/test/items/ml-article',
            user: { id: 'user2', name: 'User2' },
            created_at: '2024-01-15T11:00:00+09:00',
            updated_at: '2024-01-15T11:00:00+09:00',
            tags: [{ name: '機械学習', versions: [] }],
            body: '機械学習について',
            likes_count: 8,
            comments_count: 3,
            stocks_count: 2,
          },
        ] as QiitaArticle[],
        headers: {},
      };

      mockedAxios.get
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const articles = await collector.collectArticles(['AI', '機械学習']);

      expect(articles).toHaveLength(2);
      expect(articles[0]?.title).toBe('AI記事');
      expect(articles[1]?.title).toBe('機械学習記事');
    });
  });

  describe('transformToArticle', () => {
    it('Qiita記事データをArticle型に変換する', () => {
      const qiitaArticle: QiitaArticle = {
        id: 'transform-test',
        title: 'テスト記事',
        url: 'https://qiita.com/test/items/transform-test',
        user: { id: 'test-user', name: 'テストユーザー' },
        created_at: '2024-01-15T12:00:00+09:00',
        updated_at: '2024-01-15T12:00:00+09:00',
        tags: [
          { name: 'TypeScript', versions: [] },
          { name: 'Jest', versions: [] },
        ],
        body: 'テスト記事の本文です。**太字**や`コード`も含まれます。\n\n## 見出し\n\n内容...',
        likes_count: 15,
        comments_count: 7,
        stocks_count: 10,
      };

      const article = collector.transformToArticle(qiitaArticle);

      expect(article).toMatchObject({
        id: 'qiita-transform-test',
        title: 'テスト記事',
        url: 'https://qiita.com/test/items/transform-test',
        author: 'テストユーザー',
        source: 'qiita',
        tags: ['TypeScript', 'Jest'],
        score: 25, // likes_count + stocks_count
        relevanceScore: 0,
      });

      expect(article.excerpt).toBeDefined();
      expect(article.excerpt).toContain('テスト記事の本文');
      expect(article.excerpt).not.toContain('**'); // Markdownが除去されている
      expect(article.publishedAt).toBeInstanceOf(Date);
    });

    it('必須フィールドが欠けている場合のエラー処理', () => {
      const invalidArticle = {
        id: 'invalid',
        title: 'Valid Title',
        url: 'https://qiita.com/test/items/invalid',
        user: null, // userがnullでエラーが発生するはず
        created_at: '2024-01-15T12:00:00+09:00',
        updated_at: '2024-01-15T12:00:00+09:00',
        tags: [],
        body: '',
        likes_count: 0,
        comments_count: 0,
        stocks_count: 0,
      } as any;

      expect(() => {
        collector.transformToArticle(invalidArticle as QiitaArticle);
      }).toThrow();
    });
  });

  describe('設定', () => {
    it('アクセストークンを設定できる', () => {
      const token = 'test-token';
      collector.setAccessToken(token);

      const config = collector.getConfig();
      expect(config.accessToken).toBe(token);
    });

    it('カスタム設定で初期化できる', () => {
      const customCollector = new QiitaCollector({
        accessToken: 'custom-token',
        maxPages: 5,
        itemsPerPage: 50,
      });

      const config = customCollector.getConfig();
      expect(config.accessToken).toBe('custom-token');
      expect(config.maxPages).toBe(5);
      expect(config.itemsPerPage).toBe(50);
    });
  });

  describe('エッジケース', () => {
    it('authorがnameフィールドを持たない場合', () => {
      const qiitaArticle: QiitaArticle = {
        id: 'edge-case',
        title: 'エッジケーステスト',
        url: 'https://qiita.com/test/items/edge-case',
        user: { id: 'test-user' } as any, // nameフィールドがない
        created_at: '2024-01-15T12:00:00+09:00',
        updated_at: '2024-01-15T12:00:00+09:00',
        tags: [],
        body: '',
        likes_count: 0,
        comments_count: 0,
        stocks_count: 0,
      };

      const article = collector.transformToArticle(qiitaArticle);
      expect(article.author).toBe('test-user'); // idがauthorとして使用される
    });

    it('bodyが空またはundefinedの場合', () => {
      const qiitaArticle: QiitaArticle = {
        id: 'empty-body',
        title: 'Empty Body Test',
        url: 'https://qiita.com/test/items/empty-body',
        user: { id: 'user', name: 'User' },
        created_at: '2024-01-15T12:00:00+09:00',
        updated_at: '2024-01-15T12:00:00+09:00',
        tags: [],
        body: '', // 空文字
        likes_count: 0,
        comments_count: 0,
        stocks_count: 0,
      };

      const article = collector.transformToArticle(qiitaArticle);
      expect(article.excerpt).toBe('');
    });
  });
});
