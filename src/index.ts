import { MongoSingleton } from './mongo-singleton';

const mongoClient = new MongoSingleton();
const getDb = mongoClient.db;
const _collection = mongoClient._collection;
const collection = mongoClient.collection;
const configure = mongoClient.configure;

export default MongoSingleton;
export {
  _collection,
  collection,
  configure,
  getDb,
  mongoClient,
  MongoSingleton,
};
