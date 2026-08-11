import { cosmiconfigSync } from 'cosmiconfig';
import { MongoClientOptions } from 'mongodb';

export type ClientFileConfig = {
  uri: string;
  database?: string;
  clientOptions?: MongoClientOptions;
};

export type MongoSingletonFileConfig = Partial<ClientFileConfig> & {
  /** Named clients resolvable via `useClient(id)` with zero code-side setup. */
  clients?: Record<string, ClientFileConfig>;
};

export type ResolvedConnection = {
  uri: string;
  database?: string;
  clientOptions?: MongoClientOptions;
};

// No custom `searchPlaces` here — cosmiconfig's own sync defaults already
// cover `.mongosingletonrc(.json|.yaml|.yml|.js|.ts|.cjs)`, `mongosingleton.config.(js|ts|cjs)`,
// and a `mongoSingleton` key in package.json, and deliberately exclude `.mjs`
// (cosmiconfigSync can't load ESM — dynamic `import()` is inherently async).
const explorer = cosmiconfigSync('mongoSingleton');

let cachedFileConfig: MongoSingletonFileConfig | null | undefined;

function loadFileConfig(cwd?: string): MongoSingletonFileConfig | null {
  if (cachedFileConfig === undefined) {
    try {
      // `searchFrom` lets callers (namely tests) point at a fixture
      // directory instead of the real `process.cwd()` — process-wide
      // `process.chdir()` isn't safe here since vitest's threaded pool runs
      // multiple test files in one process.
      const result = explorer.search(cwd);
      cachedFileConfig = (result?.config as MongoSingletonFileConfig | undefined) ?? null;
    } catch {
      // Malformed config file: treat as absent rather than crashing module load.
      cachedFileConfig = null;
    }
  }
  return cachedFileConfig;
}

function envKey(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/**
 * Resolves the default (unnamed) connection.
 *
 * Precedence: env vars, then the config file's root-level `uri`/`database`.
 * Env vars win deliberately — a checked-in config file is a repo default,
 * not something that should be able to silently override a production
 * `MONGO_URI` injected by the deploy environment.
 */
export function resolveDefaultConnection(cwd?: string): ResolvedConnection | null {
  const file = loadFileConfig(cwd);
  const uri =
    process.env.MONGO_URI ??
    process.env.MONGODB_URI ??
    process.env.MONGO_URL ??
    file?.uri;
  const database =
    process.env.MONGO_DATABASE ?? process.env.MONGODB_DATABASE ?? file?.database;

  if (!uri) {
    return null;
  }
  return { uri, database, clientOptions: file?.clientOptions };
}

/**
 * Resolves a named client (`useClient(id)`) from the config file's `clients`
 * map, with a per-id env override: `MONGO_<ID>_URI` / `MONGO_<ID>_DATABASE`
 * (id upper-cased, non-alphanumerics collapsed to `_`) — e.g. `useClient('analytics')`
 * can be overridden by `MONGO_ANALYTICS_URI`.
 */
export function resolveNamedConnection(id: string, cwd?: string): ResolvedConnection | null {
  const entry = loadFileConfig(cwd)?.clients?.[id];
  const key = envKey(id);
  const uri = process.env[`MONGO_${key}_URI`] ?? entry?.uri;
  const database = process.env[`MONGO_${key}_DATABASE`] ?? entry?.database;

  if (!uri) {
    return null;
  }
  return { uri, database, clientOptions: entry?.clientOptions };
}

/** Clears the cached config-file search so the next resolve re-reads disk. Test use only. */
export function _resetConfigCache(): void {
  cachedFileConfig = undefined;
}
