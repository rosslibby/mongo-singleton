/**
 * Full connection properties used to build the MongoDB URI.
 */
export type ConnectionProps = {
  prefix: string; // e.g., "mongodb://" or "mongodb+srv://"
  username: string;
  password: string;
  host: string;
  port?: number;
  defaultauthdb?: string;
  authSource?: string;
  options?: URLSearchParams;
  logging?: boolean;
  logLevels?: string[];
};

export type SparseConnectionProps = {
  uri: string,
  logging?: boolean,
  logLevels?: string[];
};

export enum LogLevel {
  'debug' = 'debug',
  'error' = 'error',
  'info' = 'info',
  'log' = 'log',
  'warn' = 'warn',
};

export type LogResult = {
  level: string;
  message: string;
  args: any[];
};

export type LoggerCallback = (args: LogResult) => void;

export type LogMethod = (...args: any[]) => void;

export type CustomLogger = {
  debug: LogMethod;
  error: LogMethod;
  info: LogMethod;
  log: LogMethod;
  warn: LogMethod;
  logs: LogResult[];
};
