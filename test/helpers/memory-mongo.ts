import { MongoMemoryServer } from 'mongodb-memory-server';

/** Starts an ephemeral, real `mongod` for integration tests. One per test file. */
export async function startMemoryMongo(): Promise<{ uri: string; stop: () => Promise<void> }> {
  const server = await MongoMemoryServer.create();
  return {
    uri: server.getUri(),
    stop: () => server.stop(),
  };
}

let counter = 0;

/** A fresh database name per call, so tests don't collide when sharing one server. */
export function uniqueDbName(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}
