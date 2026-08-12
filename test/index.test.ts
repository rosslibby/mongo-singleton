import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startMemoryMongo, uniqueDbName } from './helpers/memory-mongo';

let mongoUri: string;
let stopMongo: () => Promise<void>;

beforeAll(async () => {
  const server = await startMemoryMongo();
  mongoUri = server.uri;
  stopMongo = server.stop;
});

afterAll(async () => {
  await stopMongo();
});

describe('root exports: zero-config singleton', () => {
  afterEach(() => {
    delete process.env.MONGO_URI;
    delete process.env.MONGO_DATABASE;
  });

  it('collection()/db() work through the root singleton once configured', async () => {
    vi.resetModules();
    process.env.MONGO_URI = mongoUri;
    process.env.MONGO_DATABASE = uniqueDbName('rootZeroConfig');

    const { collection, db } = await import('../src/index');
    await collection('users').insertOne({ _id: 'u1', name: 'Ross' });
    expect(await collection('users').findOne({ _id: 'u1' })).toMatchObject({ name: 'Ross' });
    expect(db().databaseName).toBe(process.env.MONGO_DATABASE);
  });

  it('configureMongoSingleton() reconfigures the same root instance in place', async () => {
    vi.resetModules();
    const { configureMongoSingleton, mongoClient } = await import('../src/index');

    const dbA = uniqueDbName('configureA');
    const dbB = uniqueDbName('configureB');
    configureMongoSingleton({ connection: mongoUri, database: dbA });
    const clientBefore = mongoClient.client;

    configureMongoSingleton({ connection: mongoUri, database: dbB });
    expect(mongoClient.client).not.toBe(clientBefore);
    expect(mongoClient.db().databaseName).toBe(dbB);

    await mongoClient.disconnect();
  });

  it('getConnection and disconnectAll are re-exported from the package root', async () => {
    vi.resetModules();
    const mod = await import('../src/index');
    expect(typeof mod.getConnection).toBe('function');
    expect(typeof mod.disconnectAll).toBe('function');
  });
});

describe('registerShutdown', () => {
  it('registers exactly one SIGINT/SIGTERM listener even when called multiple times', async () => {
    vi.resetModules();
    const { registerShutdown } = await import('../src/index');

    const sigintBefore = process.listeners('SIGINT');
    const sigtermBefore = process.listeners('SIGTERM');

    registerShutdown();
    registerShutdown();
    registerShutdown();

    // Exactly one net new listener per signal, no matter how many times
    // it's called -- the idempotency guard is what keeps a library helper
    // like this from silently piling up handlers if a consumer calls it
    // more than once (e.g. from multiple modules at boot).
    const sigintAfter = process.listeners('SIGINT');
    const sigtermAfter = process.listeners('SIGTERM');
    expect(sigintAfter.length).toBe(sigintBefore.length + 1);
    expect(sigtermAfter.length).toBe(sigtermBefore.length + 1);

    // Remove only the listener(s) this test added -- not
    // process.removeAllListeners(), which could also strip out anything
    // vitest itself registered in this process for its own shutdown.
    for (const fn of sigintAfter) if (!sigintBefore.includes(fn)) process.removeListener('SIGINT', fn as never);
    for (const fn of sigtermAfter) if (!sigtermBefore.includes(fn)) process.removeListener('SIGTERM', fn as never);
  });
});
