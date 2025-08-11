export type ArticleSource = 'qiita' | 'zenn' | 'hackernews' | 'devto';

export interface Article {
  id: string;
  title: string;
  url: string;
  author: string;
  publishedAt: Date;
  source: ArticleSource;
  tags: string[];
  excerpt?: string;
  score?: number;
  relevanceScore: number;
}

export interface CollectionError {
  source: string;
  error: string;
  timestamp: Date;
}

export interface CollectionResult {
  articles: Article[];
  errors: CollectionError[];
  timestamp: Date;
}

export interface QiitaArticle {
  id: string;
  title: string;
  url: string;
  user: {
    id: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
  tags: Array<{
    name: string;
    versions: string[];
  }>;
  body: string;
  likes_count: number;
  comments_count: number;
  stocks_count: number;
}

export interface ZennArticle {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  author?: string;
}

export interface HackerNewsArticle {
  objectID: string;
  title: string;
  url: string;
  author: string;
  created_at: string;
  points: number;
  num_comments: number;
}

export interface DevToArticle {
  id: number;
  title: string;
  url: string;
  user: {
    name: string;
    username: string;
  };
  published_at: string;
  tag_list: string[];
  description: string;
  positive_reactions_count: number;
  comments_count: number;
}
