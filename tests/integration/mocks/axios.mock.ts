import axios from 'axios';
import { jest } from '@jest/globals';

// Axiosをモック
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// 基本的なレスポンスモック
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

export { mockedAxios };
