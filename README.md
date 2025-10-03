# @notross/mongo-singleton

A lightweight, opinionated wrapper for the official mongodb driver that makes working with singletons and multiple clients simple, safe, and ergonomic.

## Key Features
- ✅ Works with both connection URIs and full MongoClientOptions
- ✅ Support for multiple named clients (useClient)
- ✅ Ensures a single shared connection
- ✅ Optional built-in logging with configurable log levels
- ✅ TypeScript support out of the box
- ✅ Easy singleton setup with no boilerplate
- ✅ Direct access to db and collection helpers from the package root
- ✅ No accidental overwrites — safe client management

## Installation

```bash
# NPM
npm install @notross/mongo-singleton

# Yarn
yarn add @notross/mongo-singleton
```

## TL;DR Quickstart

```ts
// index.ts
import { mongoClient, collection } from '@notross/mongo-singleton';

await mongoClient.init({
  connection: process.env.MONGO_URI,
  database: 'myApp',
});

// anywhere in your app
const user = await collection('users').findOne({ email: 'john.doe@gmail.com' });
```

## Quickstart

#### 1. Import the shared client

```ts
import { mongoClient } from '@notross/mongo-singleton';
```

#### 2. Initialize it once

```ts
mongoClient.init({
  connection: process.env.MONGO_URI,
  database: 'myApp',
});
```

#### 3. Use it anywhere

The package root exposes direct helpers for `db` and `collection`:

```ts
import { collection } from '@notross/mongo-singleton';

const user = await collection('users').findOne({ email: 'john.doe@gmail.com' });
console.log('Result:', user);
```

### Using multiple clients

You have two options if your app needs more than one distinct MongoDB client.

#### Option A: Create your own instances

```ts
import { MongoSingleton } from '@notross/mongo-singleton';

export const clientA = new MongoSingleton({ 
  connection: process.env.URI_A, 
  database: 'dbA',
});

export const clientB = new MongoSingleton({ 
  connection: process.env.URI_B, 
  database: 'dbB',
});
```

#### Option B: Use the useClient registry

`useClient` ensures a single instance per client ID across your app.

```ts
import { useClient } from '@notross/mongo-singleton';

// index.ts
useClient('client-a', { connection: process.env.URI_A, database: 'dbA' });
useClient('client-b', { connection: process.env.URI_B, database: 'dbB' });

// auth.ts
const { collection } = useClient('client-a');
const account = await collection('accounts').findOne({ email, password });

// orders.ts
const { collection } = useClient('client-b');
const orders = await collection('orders').find().toArray();
```

> ⚠️ If you call useClient('client-a') again with new props, it will not overwrite the existing client.
> 
> To reinitialize, explicitly call `client.init(...)`:

```ts
const { client } = useClient('client-a');
await client.init({ connection: '...', database: '...' });
```

## API Reference

### MongoSingleton
```ts
new MongoSingleton(
  props?: InitClientProps,
  database?: string,
);
```

#### Types
```ts
type InitClientProps = {
  connection: ConnectionOptions;
  database: string;
  config?: mongodb.MongoClientOptions;
};

type ConnectionOptions = ConnectionProps | SparseConnectionProps | string;

type ConnectionProps = {
  prefix: string; // e.g., "mongodb://" or "mongodb+srv://"
  username: string;
  password: string;
  host: string;
  port?: number;
  defaultauthdb?: string;
  authSource?: string;
  options?: URLSearchParams;
  logging?: boolean;
  logLevels?: string[];
};

type SparseConnectionProps = {
  uri: string,
  logging?: boolean,
  logLevels?: string[];
};
```

Methods:
- `init(props)` – Initialize or reinitialize the client
- `connect()` – Manually connect (optional, usually handled for you)
- `disconnect()` – Closes the connection and resets internal state
- `db` – Current Db instance (after init)
- `collection(name)` – Helper for accessing collections

Best Practices
- Always call `init(...)` (or pass config to the constructor) before using db or collection.
- Prefer `useClient` if you expect multiple distinct clients.
- Use mongoClient + exported db/collection if you only need one global client.
