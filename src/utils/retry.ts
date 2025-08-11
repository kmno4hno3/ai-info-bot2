import { RetryConfig } from '../types/Config';
import { logger } from './logger';

export class RetryError extends Error {
  constructor(
    public readonly attemptCount: number,
    public readonly lastError: Error,
    message?: string
  ) {
    super(
      message ||
        `All retry attempts failed after ${attemptCount} tries. Last error: ${lastError.message}`
    );
    this.name = 'RetryError';
  }
}

export class RetryService {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    backoffMultiplier: 2,
  };

  public static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    operationName = 'operation'
  ): Promise<T> {
    const finalConfig: RetryConfig = {
      ...RetryService.DEFAULT_CONFIG,
      ...config,
    };

    logger.debug(
      `リトライ処理開始: ${operationName} (最大${finalConfig.maxRetries}回試行)`
    );

    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
      try {
        logger.debug(
          `${operationName} 試行 ${attempt}/${finalConfig.maxRetries + 1}`
        );

        const result = await operation();

        if (attempt > 1) {
          logger.info(`${operationName} が ${attempt} 回目の試行で成功`);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt <= finalConfig.maxRetries) {
          const delay = RetryService.calculateDelay(attempt, finalConfig);

          logger.warn(
            `${operationName} 試行 ${attempt} が失敗: ${lastError.message}. ` +
              `${delay}ms後に再試行...`
          );

          await RetryService.sleep(delay);
        } else {
          logger.error(
            `${operationName} が全ての試行で失敗 (${attempt - 1}回試行)`,
            lastError
          );
        }
      }
    }

    throw new RetryError(finalConfig.maxRetries + 1, lastError);
  }

  public static async withRetryCondition<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: Error, attempt: number) => boolean,
    config: Partial<RetryConfig> = {},
    operationName = 'operation'
  ): Promise<T> {
    const finalConfig: RetryConfig = {
      ...RetryService.DEFAULT_CONFIG,
      ...config,
    };

    logger.debug(
      `条件付きリトライ処理開始: ${operationName} (最大${finalConfig.maxRetries}回試行)`
    );

    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
      try {
        logger.debug(
          `${operationName} 試行 ${attempt}/${finalConfig.maxRetries + 1}`
        );

        const result = await operation();

        if (attempt > 1) {
          logger.info(`${operationName} が ${attempt} 回目の試行で成功`);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const shouldContinue = shouldRetry(lastError, attempt);

        if (attempt <= finalConfig.maxRetries && shouldContinue) {
          const delay = RetryService.calculateDelay(attempt, finalConfig);

          logger.warn(
            `${operationName} 試行 ${attempt} が失敗: ${lastError.message}. ` +
              `${delay}ms後に再試行...`
          );

          await RetryService.sleep(delay);
        } else {
          if (!shouldContinue) {
            logger.info(
              `${operationName} のリトライを条件により中断: ${lastError.message}`
            );
          } else {
            logger.error(
              `${operationName} が全ての試行で失敗 (${attempt}回試行)`,
              lastError
            );
          }
          break;
        }
      }
    }

    throw new RetryError(finalConfig.maxRetries + 1, lastError);
  }

  public static createHttpRetryCondition(): (
    error: Error,
    attempt: number
  ) => boolean {
    return (error: Error, attempt: number): boolean => {
      // HTTP関連のエラーの場合のリトライ条件
      const errorMessage = error.message.toLowerCase();

      // リトライすべきHTTPステータスコード（5xx、429、408、503）
      const retryableStatusCodes = [500, 502, 503, 504, 429, 408];
      const hasRetryableStatus = retryableStatusCodes.some(code =>
        errorMessage.includes(code.toString())
      );

      // ネットワーク関連のエラー
      const isNetworkError =
        errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('econnreset') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('etimedout');

      // リトライ不要なエラー（4xx系、認証エラー等）
      const nonRetryableStatusCodes = [400, 401, 403, 404, 409];
      const hasNonRetryableStatus = nonRetryableStatusCodes.some(code =>
        errorMessage.includes(code.toString())
      );

      const shouldRetry =
        (hasRetryableStatus || isNetworkError) && !hasNonRetryableStatus;

      logger.debug(
        `HTTP リトライ判定: ${shouldRetry} ` +
          `(エラー: ${error.message.substring(0, 100)}...)`
      );

      return shouldRetry;
    };
  }

  public static createApiRateLimitCondition(): (
    error: Error,
    attempt: number
  ) => boolean {
    return (error: Error, attempt: number): boolean => {
      const errorMessage = error.message.toLowerCase();

      // API rate limit関連のキーワード
      const rateLimitKeywords = [
        'rate limit',
        'too many requests',
        '429',
        'quota exceeded',
        'limit exceeded',
      ];

      const isRateLimit = rateLimitKeywords.some(keyword =>
        errorMessage.includes(keyword)
      );

      if (isRateLimit) {
        logger.warn(`API レート制限検出 (試行 ${attempt}): リトライします`);
        return true;
      }

      return false;
    };
  }

  private static calculateDelay(attempt: number, config: RetryConfig): number {
    // Exponential backoff with jitter
    const exponentialDelay =
      config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);

    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delayWithJitter = exponentialDelay + jitter;

    // Cap maximum delay at 30 seconds
    return Math.min(30000, Math.max(100, delayWithJitter));
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName = 'operation'
  ): Promise<T> {
    logger.debug(
      `タイムアウト付き実行開始: ${operationName} (制限時間: ${timeoutMs}ms)`
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Operation '${operationName}' timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([operation(), timeoutPromise]);
      logger.debug(`${operationName} が制限時間内に完了`);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        logger.error(`${operationName} がタイムアウト (${timeoutMs}ms)`);
      }
      throw error;
    }
  }

  public static async executeWithTimeoutAndRetry<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    retryConfig: Partial<RetryConfig> = {},
    operationName = 'operation'
  ): Promise<T> {
    const wrappedOperation = (): Promise<T> =>
      RetryService.executeWithTimeout(operation, timeoutMs, operationName);

    return RetryService.withRetry(
      wrappedOperation,
      retryConfig,
      `${operationName} (with timeout)`
    );
  }
}
