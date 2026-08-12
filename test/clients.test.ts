import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('getConnection: registry mechanics', () => {
  it('creates one connection per id and reuses it on subsequent calls', async () => {
    const { getConnection } = await import('../src/clients');
    const id = uniqueDbName('registry');
    const first = getConnection(id, { connection: mongoUri, database: uniqueDbName('db') });
    const second = getConnection(id);
    expect(second.client).toBe(first.client);
  });

  it('does not overwrite an already-created connection when called again with new opts', async () => {
    const { getConnection } = await import('../src/clients');
    const id = uniqueDbName('noOverwrite');
    const dbA = uniqueDbName('dbA');
    const dbB = uniqueDbName('dbB');

    const first = getConnection(id, { connection: mongoUri, database: dbA });
    const second = getConnection(id, { connection: mongoUri, database: dbB });

    expect(second.client).toBe(first.client);
    expect(first.client.db().databaseName).toBe(dbA); // dbB was ignored
  });

  it('two different ids get independent connections', async () => {
    const { getConnection } = await import('../src/clients');
    const idA = uniqueDbName('idA');
    const idB = uniqueDbName('idB');
    const dbA = uniqueDbName('dbForA');
    const dbB = uniqueDbName('dbForB');

    const a = getConnection(idA, { connection: mongoUri, database: dbA });
    const b = getConnection(idB, { connection: mongoUri, database: dbB });

    expect(a.client).not.toBe(b.client);

    await a.collection('x').insertOne({ _id: '1' });
    await b.collection('x').insertOne({ _id: '2' });
    expect(await a.collection('x').findOne({ _id: '2' })).toBeNull(); // isolated databases
    expect(await b.collection('x').findOne({ _id: '2' })).toBeTruthy();
  });
});

describe('getConnection: config-file resolution wiring', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('falls back to resolveNamedConnection(id) when called with no opts', async () => {
    vi.doMock('../src/config', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/config')>();
      return {
        ...actual,
        resolveNamedConnection: vi.fn((id: string) =>
          id === 'wired-test'
            ? { uri: mongoUri, database: 'wiredFromConfig', clientOptions: undefined }
            : null,
        ),
      };
    });

    const { getConnection } = await import('../src/clients');
    const { client } = getConnection('wired-test');
    expect(client.db().databaseName).toBe('wiredFromConfig');
  });
});

describe('disconnectAll', () => {
  it('closes every registered connection and clears the registry', async () => {
    vi.resetModules();
    const { getConnection, disconnectAll } = await import('../src/clients');

    const idA = uniqueDbName('disconnectA');
    const idB = uniqueDbName('disconnectB');
    const a = getConnection(idA, { connection: mongoUri, database: uniqueDbName('db') });
    const b = getConnection(idB, { connection: mongoUri, database: uniqueDbName('db') });

    // Force both to actually connect so there's a real connection to close.
    await a.client.connect();
    await b.client.connect();
    expect(a.client.status).toBe('connected');
    expect(b.client.status).toBe('connected');

    await disconnectAll();

    expect(a.client.status).toBe('disconnected');
    expect(b.client.status).toBe('disconnected');

    // The registry was cleared, so asking for the same id again creates a
    // brand new connection rather than returning the (now-closed) old one.
    const again = getConnection(idA, { connection: mongoUri, database: uniqueDbName('db') });
    expect(again.client).not.toBe(a.client);
  });
});
