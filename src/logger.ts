import pino, { Logger } from 'pino';

/**
 * One process-wide default sink, created lazily and never mutated after
 * creation. Each MongoSingleton gets its own `.child(...)` binding off of
 * it (or off a logger the caller supplied), so per-client logging options
 * never leak across instances — unlike the old global `logger` singleton
 * this replaces, whose level/output were mutated in place by whichever
 * client initialized last.
 */
let defaultLogger: Logger | undefined;

function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  }
  return defaultLogger;
}

/**
 * @param logger - `false` disables logging for this instance. Omit to use
 *   the shared default Pino sink; pass your app's own logger to reuse it.
 * @param bindings - Extra fields (e.g. `{ client: 'analytics' }`) attached
 *   to every log line from this instance via `.child(...)`.
 */
export function createLogger(
  logger: Logger | false | undefined,
  bindings?: Record<string, unknown>,
): Logger | undefined {
  if (logger === false) {
    return undefined;
  }

  const base = logger ?? getDefaultLogger();
  return bindings ? base.child(bindings) : base;
}
