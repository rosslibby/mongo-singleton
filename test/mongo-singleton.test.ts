import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoSingleton } from '../src/mongo-singleton';
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

describe('MongoSingleton: lazy construction', () => {
  it('does not construct a driver client until first access', () => {
    // Constructing with no `connection` at all would throw if it tried to
    // resolve/construct eagerly (no env/config present in this test run).
    // It must not throw until something actually needs the client.
    expect(() => new MongoSingleton()).not.toThrow();
  });

  it('constructs the client lazily on first `.client` access', () => {
    const instance = new MongoSingleton({ connection: mongoUri, database: uniqueDbName('lazy') });
    const client = instance.client;
    expect(client).toBeDefined();
    expect(instance.client).toBe(client); // same instance on repeat access, not rebuilt every time
  });
});

describe('MongoSingleton: basic operations', () => {
  it('reads and writes through collection()', async () => {
    const instance = new MongoSingleton({ connection: mongoUri, database: uniqueDbName('basic') });
    await instance.collection('items').insertOne({ _id: 'a', value: 1 });
    const doc = await instance.collection('items').findOne({ _id: 'a' });
    expect(doc?.value).toBe(1);
    await instance.disconnect();
  });

  it('db() returns a Db bound to the instance default database', () => {
    const dbName = uniqueDbName('dbname');
    const instance = new MongoSingleton({ connection: mongoUri, database: dbName });
    expect(instance.db().databaseName).toBe(dbName);
  });
});

describe('MongoSingleton: database resolution fallback chain', () => {
  it('extracts the database name from the URI path when no explicit database is given', () => {
    const dbName = uniqueDbName('fromuri');
    const instance = new MongoSingleton({ connection: `${mongoUri}${dbName}` });
    expect(instance.db().databaseName).toBe(dbName);
  });

  it('an explicit database option takes priority over the URI path', () => {
    const explicitDb = uniqueDbName('explicit');
    const instance = new MongoSingleton({
      connection: `${mongoUri}ignoredPathDb`,
      database: explicitDb,
    });
    expect(instance.db().databaseName).toBe(explicitDb);
  });

  it('a per-call database option overrides the instance default', async () => {
    const instance = new MongoSingleton({ connection: mongoUri, database: uniqueDbName('default') });
    const otherDb = uniqueDbName('override');
    expect(instance.db(otherDb).databaseName).toBe(otherDb);
    expect(instance.collection('x', { database: otherDb }).collectionName).toBe('x');
  });

  it('throws a clear, actionable error instead of silently using the driver default "test" db', () => {
    const instance = new MongoSingleton({ connection: mongoUri.replace(/\/$/, '') });
    expect(() => instance.db()).toThrow(/No database configured/);
  });
});

describe('MongoSingleton: one client, many databases', () => {
  it('serves multiple databases from a single underlying client', async () => {
    const instance = new MongoSingleton({ connection: mongoUri, database: uniqueDbName('multiA') });
    const dbB = uniqueDbName('multiB');

    await instance.collection('x').insertOne({ _id: 'in-default-db' });
    await instance.collection('x', { database: dbB }).insertOne({ _id: 'in-other-db' });

    expect(await instance.collection('x').findOne({ _id: 'in-default-db' })).toBeTruthy();
    expect(await instance.collection('x', { database: dbB }).findOne({ _id: 'in-other-db' })).toBeTruthy();

    // Same client instance served both -- no second connection was created.
    const client = instance.client;
    expect(instance.client).toBe(client);
    await instance.disconnect();
  });
});

describe('MongoSingleton: init() reconfiguration', () => {
  it('rebuilds the underlying client rather than silently keeping the stale one', async () => {
    const dbA = uniqueDbName('initA');
    const dbB = uniqueDbName('initB');
    const instance = new MongoSingleton({ connection: mongoUri, database: dbA });

    const clientBefore = instance.client;
    instance.init({ connection: mongoUri, database: dbB });
    const clientAfter = instance.client;

    expect(clientAfter).not.toBe(clientBefore);
    expect(instance.db().databaseName).toBe(dbB);

    // And the new client actually works, not just "looks different".
    await instance.collection('probe').insertOne({ _id: 'after-init' });
    expect(await instance.collection('probe').findOne({ _id: 'after-init' })).toBeTruthy();
    await instance.disconnect();
  });
});

describe('MongoSingleton: connect() / disconnect() lifecycle', () => {
  it('connect() resolves with a working client and database, and updates status', async () => {
    const instance = new MongoSingleton({ connection: mongoUri, database: uniqueDbName('lifecycle') });
    expect(instance.status).toBe('disconnected');

    const { client, database } = await instance.connect();
    expect(client).toBeDefined();
    expect(database.databaseName).toContain('lifecycle');
    expect(instance.status).toBe('connected');

    await instance.disconnect();
    expect(instance.status).toBe('disconnected');
  });

  it('lazily reconnects after disconnect() rather than staying permanently broken', async () => {
    const instance = new MongoSingleton({ connection: mongoUri, database: uniqueDbName('reconnect') });
    await instance.collection('x').insertOne({ _id: '1' });
    await instance.disconnect();

    // Using it again after disconnect should just work, not throw.
    await instance.collection('x').insertOne({ _id: '2' });
    expect(await instance.collection('x').findOne({ _id: '2' })).toBeTruthy();
    await instance.disconnect();
  });
});
