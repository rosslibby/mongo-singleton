import * as mongodb from 'mongodb';

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
export type GetDb = () => Promise<mongodb.Db>;
