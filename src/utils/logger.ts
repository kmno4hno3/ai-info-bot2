import { LoggerConfig } from '../types/Config';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private config: LoggerConfig;
  private static instance: Logger | null = null;

  private constructor(config: LoggerConfig) {
    this.config = config;
  }

  public static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(
        config || {
          level: 'INFO',
          maskSensitiveData: true,
        }
      );
    }
    return Logger.instance;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    return levels.indexOf(level) >= levels.indexOf(this.config.level);
  }

  private maskSensitiveData(message: string): string {
    if (!this.config.maskSensitiveData) {
      return message;
    }

    // Mask webhook URLs
    let masked = message.replace(
      /https:\/\/discord\.com\/api\/webhooks\/[^\s]+/gi,
      'https://discord.com/api/webhooks/***'
    );

    // Mask API keys
    masked = masked.replace(/Bearer\s+[\w-]+/gi, 'Bearer ***');
    masked = masked.replace(/(token|key|secret)[\s=:]+[\w-]+/gi, '$1=***');

    // Mask other potential sensitive data
    masked = masked.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '***@***.***'
    );

    return masked;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = this.getTimestamp();
    const maskedMessage = this.maskSensitiveData(message);
    return `[${timestamp}] [${level}] ${maskedMessage}`;
  }

  public debug(message: string, data?: unknown): void {
    if (this.shouldLog('DEBUG')) {
      const fullMessage = data ? `${message} ${JSON.stringify(data)}` : message;
      console.log(this.formatMessage('DEBUG', fullMessage));
    }
  }

  public info(message: string, data?: unknown): void {
    if (this.shouldLog('INFO')) {
      const fullMessage = data ? `${message} ${JSON.stringify(data)}` : message;
      console.log(this.formatMessage('INFO', fullMessage));
    }
  }

  public warn(message: string, data?: unknown): void {
    if (this.shouldLog('WARN')) {
      const fullMessage = data ? `${message} ${JSON.stringify(data)}` : message;
      console.warn(this.formatMessage('WARN', fullMessage));
    }
  }

  public error(message: string, error?: Error | unknown): void {
    if (this.shouldLog('ERROR')) {
      let fullMessage = message;
      if (error instanceof Error) {
        fullMessage += ` Error: ${error.message}`;
        if (error.stack) {
          fullMessage += `\nStack: ${error.stack}`;
        }
      } else if (error) {
        fullMessage += ` ${JSON.stringify(error)}`;
      }
      console.error(this.formatMessage('ERROR', fullMessage));
    }
  }

  public setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  public setMaskSensitiveData(mask: boolean): void {
    this.config.maskSensitiveData = mask;
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
export { Logger };
