import { MongoSingleton } from './mongo-singleton';
import { MongoSingletonOptions } from './types';
import { disconnectAll, getConnection } from './clients';
import { registerShutdown as registerShutdownImpl } from './shutdown';

const mongoClient = new MongoSingleton();
const db = mongoClient.db;
const collection = mongoClient.collection;
const connect = mongoClient.connect;

/** (Re)configures the default `mongoClient` singleton — the single entry point if you'd rather not rely on env vars/a config file. */
const configureMongoSingleton = (opts: MongoSingletonOptions): void => mongoClient.init(opts);

const registerShutdown = (...extra: MongoSingleton[]): void =>
  registerShutdownImpl(mongoClient, ...extra);

export default MongoSingleton;
export {
  collection,
  configureMongoSingleton,
  connect,
  db,
  disconnectAll,
  getConnection,
  mongoClient,
  MongoSingleton,
  registerShutdown,
};
export * from './types';
