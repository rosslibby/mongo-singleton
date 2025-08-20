# @notross/mongo-singleton

A lightweight, zero-fuss way to get a **single shared MongoDB connection** across your Node.js codebase. Like me, it’s single and looking for a connection. 💔

```bash
# NPM
npm install @notross/mongo-singleton

# Yarn
yarn add @notross/mongo-singleton
```

## Quick start

[-- start copy]

### Mongo Singleton Client

```ts
// Initialize Mongo Singleton
import { getDb, mongoClient } from '@notross/mongo-singleton';

const mongoURI = 'mongodb://username:password@localhost:27017';
const databaseName = 'admin';

mongoClient.init({
  connection: mongoURI,
  database: databaseName,
});

// Use the standard MongoDB NPM package functions

async function getAccountById(_id: ObjectId) {
  const database = await getDb();
  const collection = database.collection('accounts');
  const account = await collection.findOne({ _id });
  return account;
}
```

You can use the `collection` client on its own.

```ts
import { collection } from '@notross/mongo-singleton';

const pendingOrders = collection('orders').then(
  (orders) => orders.find({ status: 'pending' }).toArray()
);
```

Then, in other files:

```typescript
// account.ts
import { getDb } from '@notross/mongo-singleton';

async function getAccountById(_id: ObjectId) {
  const database = await getDb();
  return database.collection('accounts').findOne({ _id });
}

// or

import { collection } from '@notross/mongo-singleton';

async function getAccountById(_id: ObjectId) {
  return collection('accounts').then((accounts) => {
    return accounts.findOne({ _id });
  });
}
```

> Note:
> - Calling `connect()`, `getDb()` or `collection(...)` multiple times reuses the same connection.

<!-- ## Usage Patterns

### 1. Export the MongoSingleton instance (recommended)

Keeps connection logic centralized:

```typescript
/** database.ts */
import { MongoSingleton } from '@notross/mongo-singleton';

export const mongoClient = new MongoSingleton(
  'mongodb://username:password@localhost:27017',
  'admin'
);
```

```typescript
/** account.ts */
import { mongoClient } from './database';

export async function getAccountById(_id: ObjectId) {
  const { database } = await mongoClient.connect();
  return database.collection('accounts').findOne({ _id });
}
```

### 2. Use connect() with a callback

If you prefer an inline callback approach:

```typescript
const account = await mongoClient.connect(async ({ database }) => {
  return database.collection('accounts').findOne({ _id });
});
```

### 3. Manually store the client and DB (less common)

```typescript
let client: MongoClient | null = null;
let database: Db | null = null;

mongoClient.connect().then(({ client: c, database: db }) => {
  client = c;
  database = db;
});
``` -->

## API

`new MongoSingleton(connectionProps, databaseName)`

- connectionProps can be:
  - ConnectionProps – full connection details (host, username, etc.)
  - SparseConnectionProps – a MongoDB URI and some config options
  - string – just a MongoDB URI
- databaseName: The DB name to use for db.collection() calls.

`.connect(): Promise<{ client: MongoClient; database: Db }>`

- Connects to MongoDB if not already connected.
- Returns the existing connection if one is already open.

`.disconnect(): Promise<void>`

- Closes the connection and resets internal state.

## Key Features
- ✅ Ensures a single shared connection
- ✅ Optional built-in logging with configurable log levels
- ✅ TypeScript support out of the box

### LogLevel enum
```typescript
enum LogLevel {
  'debug' = 'debug',
  'error' = 'error',
  'info' = 'info',
  'log' = 'log',
  'warn' = 'warn',
}
```
