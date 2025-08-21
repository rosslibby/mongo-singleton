import { ServerApiVersion } from 'mongodb';

export const defaultConfig = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};
