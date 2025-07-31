# @notross/mongo-singleton

A lightweight, zero-fuss way to get a **single shared MongoDB connection** across your Node.js codebase. Like me, it’s single and looking for a connection. 💔

```bash
# NPM
npm install @notross/mongo-singleton

# Yarn
yarn add @notross/mongo-singleton
```

## Quick start

```typescript
// database.ts
import MongoSingleton from '@notross/mongo-singleton';

const mongoURI = 'mongodb://username:password@localhost:27017';
const databaseName = 'admin';

export const mongoClient = new MongoSingleton(mongoURI, databaseName);
```

Then, in other files:

```typescript
// account.ts
import { mongoClient } from './database';

async function getAccountById(_id: ObjectId) {
  const { database } = await mongoClient.connect();
  return database.collection('accounts').findOne({ _id });
}
```

> Note:
> - Calling `connect()` multiple times reuses the same connection.
> - Export your MongoSingleton instance to maintain a single shared connection.

## Usage Patterns

### 1. Export the MongoSingleton instance (recommended)

Keeps connection logic centralized:

```typescript
/** database.ts */
import MongoSingleton from '@notross/mongo-singleton';

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
```

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
