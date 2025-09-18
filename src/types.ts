import * as mongodb from 'mongodb';
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
  logging?: boolean;
  logLevels?: string[];
};

export type SparseConnectionProps = {
  uri: string,
  logging?: boolean,
  logLevels?: string[];
};

export type ConnectionOptions = ConnectionProps |
  SparseConnectionProps | string;

export type InitClientProps = {
  connection: ConnectionOptions;
  database: string;
  config?: mongodb.MongoClientOptions;
};

export type UseClientResponse = {
  client: MongoSingleton;
  collection: GetCollection;
  db: GetDatabase;
};
export type SingletonClient = mongodb.MongoClient | null;
export type InitClient = (
  props: InitClientProps,
) => void;
export type SetConfig = (
  config: mongodb.MongoClientOptions,
) => void;
export type GetCollection = (
  name: string,
) => mongodb.Collection<mongodb.Document>;
export type ConnectAndGetDb = () => Promise<mongodb.Db>;
export type GetDatabase = (client: mongodb.MongoClient) => mongodb.Db;
