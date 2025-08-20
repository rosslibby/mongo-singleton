import { Collection, Db, Document, MongoClient, ServerApiVersion } from 'mongodb';
import {
  ConnectionOptions,
  ConnectionProps,
  InitClientProps,
  LogLevel,
  SparseConnectionProps,
} from './types';
import { buildConnectionString, Logger } from './utils';

const mongodbConfig = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

const logger = new Logger();

/**
 * MongoSingleton
 *
 * Manages a single, shared MongoDB connection for the application.
 * Subsequent calls to `.connect()` return the same connection.
 *
 * Like me, it's single and looking for a connection. 💔
 */
export class MongoSingleton {
  private databaseName: string = '';
  private uri: string = 'mongodb://localhost:27017';
  public client: MongoClient | null = null;
  public database: Db | null = null;
  public status: string = 'Disconnected';
  public error?: any = null;
  public init: (props: InitClientProps) => void = this.setup.bind(this);
  public collection: (name: string) => Promise<Collection<Document>> = this.getCollection.bind(this);
  public db: () => Promise<Db> = this.getDb.bind(this);

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
  }

  private setup({ connection, database }: InitClientProps = {
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

  private initializeClient(): MongoClient {
    if (this.client) {
      return this.client;
    }

    const client = new MongoClient(this.uri, mongodbConfig);
    return client;
  }

  private initializeDatabase(client: MongoClient): Db {
    this.database = client.db(this.databaseName);
    return this.database;
  }

  private _getDb(client: MongoClient): Db {
    return this.database || this.initializeDatabase(client);
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
    client: MongoClient;
    database: Db;
  }> {
    if (this.client) {
      return {
        client: this.client,
        database: this._getDb(this.client),
      };
    }

    this.client = this.initializeClient();
    await this.client.connect().then(
      (client) => this.initializeDatabase(client)
    );

    this.client.on('connectionReady', () => {
      this.status = 'MongoDB connection is ready';
      logger.log(this.status);
    });
    this.client.on('close', () => {
      this.status = 'MongoDB connection closed';
      logger.log(this.status);
    });
    this.client.on('error', (err) => {
      this.status = 'MongoDB connection error';
      this.error = err;
      logger.error(this.status, err);
    });
    this.client.on('reconnect', () => {
      this.status = 'MongoDB reconnected';
      logger.log(this.status);
    });
    this.client.on('reconnectFailed', () => {
      this.status = 'MongoDB reconnection failed';
      logger.error(this.status);
    });
    this.client.on('timeout', () => {
      this.status = 'MongoDB connection timed out';
      logger.error(this.status);
    });
    this.client.on('serverHeartbeatFailed', (err) => {
      this.status = 'MongoDB server heartbeat failed:';
      this.error = err;
      logger.error(this.status, this.error);
    });
    this.client.on('serverHeartbeatSucceeded', () => {
      this.status = 'MongoDB server heartbeat succeeded';
      logger.log(this.status);
    });
    this.client.on('serverClosed', () => {
      this.status = 'MongoDB server closed';
      logger.log(this.status);
    });
    this.client.on('serverOpening', () => {
      this.status = 'MongoDB server opening';
      logger.log(this.status);
    });
    return {
      client: this.client,
      database: this._getDb(this.client),
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

  public async getDb(): Promise<Db> {
    const { database } = await this.connect();
    return database;
  }

  public async getCollection(
    name: string,
    callback?: (...args: any[]) => Promise<any>,
  ): Promise<Collection<Document>> {
    const database = await this.db();
    const collection = database.collection(name);
    return collection;
  }
}

export const mongoClient = new MongoSingleton();
export const getDb = mongoClient.db;
export const collection = mongoClient.collection;
