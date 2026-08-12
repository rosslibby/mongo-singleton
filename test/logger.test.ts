import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { createLogger } from '../src/logger';

describe('createLogger', () => {
  it('returns undefined when logging is disabled with `false`', () => {
    expect(createLogger(false)).toBeUndefined();
  });

  it('returns a working default logger when nothing is passed', () => {
    const logger = createLogger(undefined);
    expect(logger).toBeDefined();
    expect(typeof logger?.info).toBe('function');
  });

  it('reuses the same default logger instance across calls, rather than creating a new sink each time', () => {
    // The bug this replaces: the old package's logger was a single shared
    // *mutable* global, so configuring one client's logging clobbered every
    // other client's. The fix isn't "never share a default" (creating a new
    // pino instance per client would mean multiple independent output
    // streams) -- it's "share a default, but never let one caller mutate
    // it out from under another." This checks the sharing half; the next
    // test checks the non-mutation half.
    const a = createLogger(undefined);
    const b = createLogger(undefined);
    expect(a).toBe(b);
  });

  it('gives each caller an independent child logger when bindings are supplied, never mutating the shared default', () => {
    const plain = createLogger(undefined);
    const withBindingsA = createLogger(undefined, { client: 'a' });
    const withBindingsB = createLogger(undefined, { client: 'b' });

    // Each binding produces its own distinct logger object...
    expect(withBindingsA).not.toBe(plain);
    expect(withBindingsA).not.toBe(withBindingsB);
    // ...and the shared default handed out elsewhere is unaffected.
    expect(createLogger(undefined)).toBe(plain);
  });

  it('uses a caller-supplied logger directly when no bindings are given', () => {
    const custom = pino({ level: 'debug' });
    const result = createLogger(custom);
    expect(result).toBe(custom);
  });

  it('returns a child of a caller-supplied logger when bindings are given, without mutating the original', () => {
    const custom = pino({ level: 'debug' });
    const result = createLogger(custom, { client: 'analytics' });
    expect(result).not.toBe(custom);
    expect(typeof result?.info).toBe('function');
  });
});
