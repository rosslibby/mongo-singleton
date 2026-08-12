import { ServerApiVersion, MongoClientOptions } from 'mongodb';

export const DEFAULT_URI = 'mongodb://localhost:27017';

export const DEFAULT_CLIENT_OPTIONS: MongoClientOptions = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};
