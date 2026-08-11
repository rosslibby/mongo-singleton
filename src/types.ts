import * as mongodb from 'mongodb';
import type { Logger } from 'pino';
import { MongoSingleton } from './mongo-singleton';

export { mongodb };

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
};

export type SparseConnectionProps = {
  uri: string;
};

/**
 * Named `ConnectionInput`, not `ConnectionOptions`, deliberately: `mongodb`
 * itself exports a public `ConnectionOptions` interface (driver-level socket
 * options), and since this package re-exports `mongodb` too, a same-named
 * type here would be a real, confusable collision for consumers.
 */
export type ConnectionInput = ConnectionProps | SparseConnectionProps | string;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** A `Collection` that's also awaitable/thenable — see `MongoSingleton.collection()`. */
export type LazyCollection<T extends mongodb.Document = mongodb.Document> = mongodb.Collection<T> &
  PromiseLike<mongodb.Collection<T>>;

/**
 * `logger: false` disables logging entirely. Omit to get a default Pino
 * instance; pass your app's own (or a `.child(...)` of it) to share one.
 */
export type MongoSingletonOptions = {
  connection?: ConnectionInput;
  database?: string;
  clientOptions?: mongodb.MongoClientOptions;
  logger?: Logger | false;
};

export type CollectionOptions = {
  database?: string;
};

/** Returned by `getConnection(id)`: the managed connection plus its accessor helpers. */
export type ConnectionHandle = {
  client: MongoSingleton;
  collection: MongoSingleton['collection'];
  db: MongoSingleton['db'];
};
