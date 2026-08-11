import * as mongodb from 'mongodb';
import type { Logger } from 'pino';
import {
  CollectionOptions,
  ConnectionInput,
  ConnectionProps,
  ConnectionStatus,
  LazyCollection,
  MongoSingletonOptions,
  SparseConnectionProps,
} from './types';
import { DEFAULT_CLIENT_OPTIONS } from './defaults';
import { resolveDefaultConnection } from './config';
import { buildConnectionString, extractDatabaseFromUri } from './utils';
import { createLogger } from './logger';
import { makeLazyCollection } from './lazy-collection';

/**
 * MongoSingleton
 *
 * Manages a single, lazily-created, shared MongoDB connection. The driver
 * client itself isn't constructed until the first `.collection()`, `.db()`,
 * or `.connect()` call — not at construction time — so a zero-arg instance
 * (as created for the package's root `mongoClient` export) can be declared
 * at module-import time even before env vars or a config file are available.
 *
 * Like me, it's single and looking for a connection. 💔
 */
export class MongoSingleton {
  private uri: string | undefined;
  private clientOptions: mongodb.MongoClientOptions = DEFAULT_CLIENT_OPTIONS;
  private defaultDatabase: string | undefined;
  private _client: mongodb.MongoClient | null = null;
  private connectPromise: Promise<mongodb.MongoClient> | null = null;
  private listenersAttached = false;

  public log: Logger | undefined;
  public status: ConnectionStatus = 'disconnected';
  public error: Error | null = null;

  constructor(opts?: MongoSingletonOptions) {
    if (opts) {
      this.applyOptions(opts);
    } else {
      this.log = createLogger(undefined);
    }
  }

  /** Lazily-created driver client. Accessing this never blocks on a network call. */
  public get client(): mongodb.MongoClient {
    return this.getOrCreateClient();
  }

  /**
   * (Re)initializes this instance with new connection settings — the same
   * method covers both first-time setup and reconfiguration. Safe to call on
   * an already-initialized instance: any existing client is swapped out
   * immediately and the stale one is closed in the background.
   */
  public init = (opts: MongoSingletonOptions): void => {
    this.applyOptions(opts);
    this.resetClient();
  };

  /**
   * Returns a collection handle that works three ways:
   *
   *   collection('users').findOne(...)                       // direct call
   *   const users = await collection('users');                // await-to-value
   *   collection('users').then((users) => users.findOne(...)) // .then chain
   *
   * All three are safe before connecting — the driver connects lazily on
   * the first operation you run, regardless of call style.
   */
  public collection = <T extends mongodb.Document = mongodb.Document>(
    name: string,
    opts?: CollectionOptions,
  ): LazyCollection<T> => {
    return makeLazyCollection(this.getDatabase(opts?.database).collection<T>(name));
  };

  /** Returns a `Db` handle for `database`, or this instance's default database. */
  public db = (database?: string): mongodb.Db => {
    return this.getDatabase(database);
  };

  /**
   * Explicitly waits for a connection and wires up status/event logging.
   * Not required before using `collection()`/`db()` — the driver connects
   * lazily on first operation regardless — but useful for pre-warming at
   * boot or failing fast on bad credentials before serving traffic.
   */
  public connect = async (): Promise<{
    client: mongodb.MongoClient;
    database: mongodb.Db;
  }> => {
    const client = await this.ensureConnected();
    return { client, database: this.getDatabase() };
  };

  /**
   * Closes the connection, if one exists, and resets internal state so the
   * next `.collection()`/`.db()`/`.connect()` call lazily creates a fresh
   * client rather than throwing.
   */
  public disconnect = async (): Promise<void> => {
    const client = this._client;
    if (!client) {
      this.log?.warn('No MongoDB client to disconnect');
      return;
    }

    this._client = null;
    this.connectPromise = null;
    this.listenersAttached = false;
    this.status = 'disconnected';

    try {
      await client.close();
      this.log?.info('Disconnected from MongoDB');
    } catch (err) {
      this.status = 'error';
      this.error = err instanceof Error ? err : new Error(String(err));
      this.log?.error({ err }, 'Error disconnecting from MongoDB');
    }
  };

  private applyOptions(opts: MongoSingletonOptions): void {
    this.log = createLogger(opts.logger);
    if (opts.clientOptions) {
      this.clientOptions = opts.clientOptions;
    }
    if (opts.database) {
      this.defaultDatabase = opts.database;
    }
    if (opts.connection) {
      this.uri = MongoSingleton.resolveConnectionString(opts.connection);
    }
  }

  private static resolveConnectionString(connection: ConnectionInput): string {
    if (typeof connection === 'string') {
      return connection;
    }
    const sparse = connection as SparseConnectionProps;
    return sparse.uri ?? buildConnectionString(connection as ConnectionProps);
  }

  /** Swaps out the current client (if any) for a fresh lazy slot, closing the old one in the background. */
  private resetClient(): void {
    const previous = this._client;
    this._client = null;
    this.connectPromise = null;
    this.listenersAttached = false;
    this.status = 'disconnected';

    if (previous) {
      void previous.close().catch((err: unknown) => {
        this.log?.warn({ err }, 'Error closing previous MongoDB client');
      });
    }
  }

  /** Resolves `this.uri` from env vars / config file if it wasn't set explicitly, throwing a clear error if nothing is configured anywhere. */
  private ensureUri(): string {
    if (this.uri) {
      return this.uri;
    }

    const resolved = resolveDefaultConnection();
    if (!resolved) {
      throw new Error(
        'No MongoDB connection configured. Set MONGO_URI (or MONGODB_URI/MONGO_URL) and ' +
          'MONGO_DATABASE, add a mongosingleton config file, or call mongoClient.init({ connection, database }).',
      );
    }

    this.uri = resolved.uri;
    this.defaultDatabase ??= resolved.database;
    if (resolved.clientOptions && this.clientOptions === DEFAULT_CLIENT_OPTIONS) {
      this.clientOptions = resolved.clientOptions;
    }
    return this.uri;
  }

  private getOrCreateClient(): mongodb.MongoClient {
    if (!this._client) {
      this._client = new mongodb.MongoClient(this.ensureUri(), this.clientOptions);
    }
    return this._client;
  }

  private getDatabase(database?: string): mongodb.Db {
    const client = this.getOrCreateClient();
    const name = database ?? this.defaultDatabase ?? extractDatabaseFromUri(this.uri as string);

    if (!name) {
      throw new Error(
        'No database configured. Pass `database` to init()/collection()/db(), set MONGO_DATABASE, ' +
          'add one to your mongosingleton config, or include it in the connection URI (mongodb://host/dbname).',
      );
    }

    return client.db(name);
  }

  private ensureConnected(): Promise<mongodb.MongoClient> {
    const client = this.getOrCreateClient();

    if (!this.connectPromise) {
      this.status = 'connecting';
      this.connectPromise = client
        .connect()
        .then((connected) => {
          this.status = 'connected';
          this.error = null;
          this.attachEventListeners(connected);
          return connected;
        })
        .catch((err: unknown) => {
          this.status = 'error';
          this.error = err instanceof Error ? err : new Error(String(err));
          this.connectPromise = null; // allow retry on next call
          throw err;
        });
    }

    return this.connectPromise;
  }

  private attachEventListeners(client: mongodb.MongoClient): void {
    if (this.listenersAttached) {
      return;
    }
    this.listenersAttached = true;

    client.on('close', () => {
      this.status = 'disconnected';
      this.log?.info('MongoDB connection closed');
    });
    client.on('error', (err) => {
      this.status = 'error';
      this.error = err instanceof Error ? err : new Error(String(err));
      this.log?.error({ err }, 'MongoDB connection error');
    });
    client.on('timeout', () => {
      this.log?.error('MongoDB connection timed out');
    });
    client.on('serverHeartbeatFailed', (event) => {
      this.log?.warn({ event }, 'MongoDB server heartbeat failed');
    });
    client.on('serverClosed', () => {
      this.log?.info('MongoDB server closed');
    });
    client.on('serverOpening', () => {
      this.log?.info('MongoDB server opening');
    });
  }
}
