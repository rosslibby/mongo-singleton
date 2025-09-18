import { MongoSingleton } from './mongo-singleton';

const mongoClient = new MongoSingleton();
const getDb = mongoClient.db;
const collection = mongoClient.collection;
const configure = mongoClient.configure;

export default MongoSingleton;
export {
  collection,
  configure,
  getDb,
  mongoClient,
  MongoSingleton,
};
