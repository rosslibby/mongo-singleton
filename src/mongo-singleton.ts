import * as mongodb from 'mongodb';
import { logger, LogLevel } from '@notross/node-client-logger';
import {
  ConnectAndGetDb,
  ConnectionOptions,
  ConnectionProps,
  GetCollection,
  GetDatabase,
  InitClient,
  InitClientProps,
  SetConfig,
  SparseConnectionProps,
} from './types';
import { defaultConfig } from './config';
import { buildConnectionString } from './utils';

/**
 * MongoSingleton
 *
 * Manages a single, shared MongoDB connection for the application.
 * Subsequent calls to `.connect()` return the same connection.
 *
 * Like me, it's single and looking for a connection. 💔
 */
export class MongoSingleton {
  private config: mongodb.MongoClientOptions = defaultConfig;
  private databaseName: string = '';
  private uri: string = 'mongodb://localhost:27017';
  public client: mongodb.MongoClient | null = null;
  public database: mongodb.Db | null = null;
  public status: string = 'Disconnected';
  public error?: any = null;
  public init: InitClient;
  public collection: GetCollection;
  public connectedDb: ConnectAndGetDb;
  public db: GetDatabase;
  public configure: SetConfig;

  /**
   * @param connection - Either a full ConnectionProps object,
   *                     a SparseConnectionProps object, or a
   *                     raw MongoDB URI string.
   * @param database - The name of the database to operate on.
   */

  constructor(props?: InitClientProps) {
    if (props) {
      this.setup(props);
    }
    this.setConfig(props?.config);
    this.collection = this.getCollection.bind(this);
    this.configure = this.setConfig.bind(this);
    this.connectedDb = this.getDb.bind(this);
    this.db = this._getDb.bind(this);
    this.init = this.setup.bind(this);
  }

  private setup({ config, connection, database }: InitClientProps = {
    connection: 'mongodb://localhost:27017',
    database: '',
  }): void {
    this.initializeLogging(connection);
    this.databaseName = database;
    if (typeof connection === 'string') {
      this.uri = connection;
    } else {
      this.uri = (connection as SparseConnectionProps).uri ||
        buildConnectionString(connection as ConnectionProps);
    }

    if (config) {
      this.setConfig(config);
    }

    this.initializeClient();
  }

  private setConfig(
    config: mongodb.MongoClientOptions = defaultConfig,
  ): void {
    this.config = config;
  }

  private initializeLogging(props: ConnectionOptions): void {
    const logging = typeof props === 'object'
      ? props.logging ?? true
      : true;
    logger.toggleLogging(logging);

    const levels = typeof props === 'object'
      ? props.logLevels ?? undefined
      : undefined;
    logger.setLevels(levels as LogLevel[]);
  }

  private initializeClient(): mongodb.MongoClient {
    if (this.client) {
      return this.client;
    }

    this.client = new mongodb.MongoClient(this.uri, this.config);
    return this.client;
  }

  private initializeDatabase(): mongodb.Db {
    const client = this.client as mongodb.MongoClient;
    this.database = client.db(this.databaseName);
    return this.database;
  }

  public _getDb(): mongodb.Db {
    return this.database || this.initializeDatabase();
  }

  /**
   * Establishes a connection to MongoDB if not already connected.
   * If already connected, returns the existing client and database.
   *
   * @returns Promise resolving to the connected MongoClient and Db.
   * @example
   * const { client, database } = await mongoClient.connect();
   */
  public async connect(): Promise<{
    client: mongodb.MongoClient;
    database: mongodb.Db;
  }> {
    if (this.client) {
      return {
        client: this.client,
        database: this._getDb(),
      };
    }

    const client = this.initializeClient();
    await client.connect().then(() => this.initializeDatabase());

    client.on('connectionReady', () => {
      this.status = 'MongoDB connection is ready';
      logger.log(this.status);
    });
    client.on('close', () => {
      this.status = 'MongoDB connection closed';
      logger.log(this.status);
    });
    client.on('error', (err) => {
      this.status = 'MongoDB connection error';
      this.error = err;
      logger.error(this.status, err);
    });
    client.on('reconnect', () => {
      this.status = 'MongoDB reconnected';
      logger.log(this.status);
    });
    client.on('reconnectFailed', () => {
      this.status = 'MongoDB reconnection failed';
      logger.error(this.status);
    });
    client.on('timeout', () => {
      this.status = 'MongoDB connection timed out';
      logger.error(this.status);
    });
    client.on('serverHeartbeatFailed', (err) => {
      this.status = 'MongoDB server heartbeat failed:';
      this.error = err;
      logger.error(this.status, this.error);
    });
    client.on('serverHeartbeatSucceeded', () => {
      this.status = 'MongoDB server heartbeat succeeded';
      logger.log(this.status);
    });
    client.on('serverClosed', () => {
      this.status = 'MongoDB server closed';
      logger.log(this.status);
    });
    client.on('serverOpening', () => {
      this.status = 'MongoDB server opening';
      logger.log(this.status);
    });
    return {
      client: client,
      database: this._getDb(),
    };
  }

  /**
   * Gracefully closes the MongoDB connection and resets internal state.
   * If no client exists, logs a warning instead.
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close().then(() => {
        this.client = null;
        this.database = null;
        this.status = 'Disconnected from MongoDB';
        logger.log(this.status);
      }).catch((err) => {
        this.status = 'Error disconnecting from MongoDB'
        this.error = err;
        logger.error(this.status, err);
      });
    } else {
      this.status = 'No MongoDB client to disconnect';
      logger.warn(this.status);
    }
  }

  public async getDb(): Promise<mongodb.Db> {
    const { database } = await this.connect();
    return database;
  }

  public getCollection(
    name: string,
  ): mongodb.Collection<mongodb.Document> {
    const database = this._getDb();
    return database.collection(name);
  }
}
