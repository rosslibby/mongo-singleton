import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _resetConfigCache, resolveDefaultConnection, resolveNamedConnection } from '../src/config';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'with-config-file');

const ENV_KEYS = [
  'MONGO_URI',
  'MONGODB_URI',
  'MONGO_URL',
  'MONGO_DATABASE',
  'MONGODB_DATABASE',
  'MONGO_ANALYTICS_URI',
  'MONGO_ANALYTICS_DATABASE',
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  _resetConfigCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  _resetConfigCache();
});

describe('resolveDefaultConnection', () => {
  it('returns null when nothing is configured anywhere', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'mongo-singleton-test-'));
    try {
      expect(resolveDefaultConnection(emptyDir)).toBeNull();
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('resolves from a config file when present', () => {
    const result = resolveDefaultConnection(FIXTURE_DIR);
    expect(result).toEqual({
      uri: 'mongodb://from-fixture-config:27017',
      database: 'fixtureDb',
      clientOptions: undefined,
    });
  });

  it('prefers MONGO_URI/MONGO_DATABASE env vars over the config file', () => {
    process.env.MONGO_URI = 'mongodb://from-env:27017';
    process.env.MONGO_DATABASE = 'envDb';
    const result = resolveDefaultConnection(FIXTURE_DIR);
    expect(result?.uri).toBe('mongodb://from-env:27017');
    expect(result?.database).toBe('envDb');
  });

  it('falls back through MONGODB_URI, then MONGO_URL, in order', () => {
    process.env.MONGODB_URI = 'mongodb://from-mongodb-uri:27017';
    process.env.MONGO_URL = 'mongodb://from-mongo-url:27017';
    expect(resolveDefaultConnection()?.uri).toBe('mongodb://from-mongodb-uri:27017');

    delete process.env.MONGODB_URI;
    _resetConfigCache();
    expect(resolveDefaultConnection()?.uri).toBe('mongodb://from-mongo-url:27017');
  });

  it('mixes sources: env var for uri, config file for database, when only uri is overridden', () => {
    process.env.MONGO_URI = 'mongodb://from-env:27017';
    const result = resolveDefaultConnection(FIXTURE_DIR);
    expect(result?.uri).toBe('mongodb://from-env:27017');
    expect(result?.database).toBe('fixtureDb');
  });
});

describe('resolveNamedConnection', () => {
  it('returns null for an id with no matching config anywhere', () => {
    expect(resolveNamedConnection('doesNotExist', FIXTURE_DIR)).toBeNull();
  });

  it('resolves a named client from the config file clients map', () => {
    const result = resolveNamedConnection('analytics', FIXTURE_DIR);
    expect(result).toEqual({
      uri: 'mongodb://analytics-fixture:27017',
      database: 'analyticsFixtureDb',
      clientOptions: undefined,
    });
  });

  it('lets a per-id env override (MONGO_<ID>_URI) win over the config file entry', () => {
    process.env.MONGO_ANALYTICS_URI = 'mongodb://analytics-from-env:27017';
    const result = resolveNamedConnection('analytics', FIXTURE_DIR);
    expect(result?.uri).toBe('mongodb://analytics-from-env:27017');
    // database still comes from the config file since no per-id override was set for it
    expect(result?.database).toBe('analyticsFixtureDb');
  });

  it('lets a per-id database env override win too', () => {
    process.env.MONGO_ANALYTICS_DATABASE = 'envAnalyticsDb';
    const result = resolveNamedConnection('analytics', FIXTURE_DIR);
    expect(result?.database).toBe('envAnalyticsDb');
  });
});
