import { MongoSingleton } from './mongo-singleton';

const mongoClient = new MongoSingleton();
const db = mongoClient.db;
const getDb = mongoClient.connectedDb;
const collection = mongoClient.collection;
const configure = mongoClient.configure;

export default MongoSingleton;
export {
  collection,
  configure,
  db,
  getDb,
  mongoClient,
  MongoSingleton,
};
