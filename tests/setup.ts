// Jest setup file
// Global test configuration and mocks

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

// Mock process.env for tests
process.env.NODE_ENV = 'test';
process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/test/test';

// Set timeout for async operations
jest.setTimeout(10000);

// Setup completed
