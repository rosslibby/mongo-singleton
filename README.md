# @notross/mongo-singleton
[<img src="https://img.shields.io/npm/v/@notross/mongo-singleton" />](https://npmjs.com/package/@notross/mongo-singleton)

Zero-config, lazy-loading MongoDB client for Node.js. Configures automatically via environment variables and exposes top-level db and collection helpers for instant, zero-boilerplate database access.

## Key Features
- ⚡ **Lazy & Top-Level Access:** Clients initialize on first call with `db` and `collection` exported directly from the package root
- 🛠️ **Zero-Config Defaults:** Automatically resolves `MONGO_URI` / `MONGO_DATABASE` (or a config file) with zero setup required
- 🔀 **Flexible Connection Setup:** Supports full URIs, structured connection params, or custom `MongoClientOptions`
- 🗄️ **Multi-Database & Multi-Connection:** Switch databases on a single cluster without extra connections, or manage multiple named isolated connections via `getConnection()`
- 🎯 **Flexible Call Patterns:** Call `collection()` directly, `await` it, or chain `.then()` — whichever fits your call site best
- 📐 **First-Class TypeScript:** Full type safety with generic `collection<T>(name)` support out of the box
- 🪵 **[Pino](https://getpino.io) Logging:** Plug in your own Pino logger or rely on sensible, built-in defaults

## Installation

```bash
# NPM
npm install @notross/mongo-singleton

# Yarn
yarn add @notross/mongo-singleton
```

## Quickstart: zero config

Set an environment variable — that's it:

```bash
MONGO_URI="mongodb://localhost:27017/myApp"
```

```ts
import { collection } from '@notross/mongo-singleton';

// 1. One-shot query
const user = await collection('users').findOne({ email: 'john.doe@gmail.com' });

// 2. Reuse the collection handle
const users = await collection('users');
const sameUser = await users.findOne({ email: 'john.doe@gmail.com' });

// 3. Chainable in non-async functions
const getUserByEmail = (email: string) =>
  collection('users').then((users) => users.findOne({ email }));
```

## Connection & database defaults

If `MONGO_URI` includes a database path (as shown above), it's parsed automatically. If you prefer to keep them separate:

```bash
MONGO_URI="mongodb://localhost:27017"
MONGO_DATABASE="myApp"
```

> Hosting Platform Fallbacks: `MONGODB_URI`, `MONGO_URL`, and `MONGODB_DATABASE` are also recognized automatically to support standard platform conventions (Vercel, Heroku, Railway, etc.).

> Fail-Safe Guard: If no configuration is detected, the first `collection()`, `db()`, or `connect()` call throws an explicit error immediately. It will never silently default to `localhost` or the driver's default `test` database.

## Programmatic configuration

Prefer configuring via code instead of environment variables? Call `configureMongoSingleton` once at application boot:

```ts
import { configureMongoSingleton } from '@notross/mongo-singleton';

configureMongoSingleton({
  connection: process.env.MY_CUSTOM_MONGO_CONNECTION_STRING,
  database: 'myApp',
});
```

## Configuration Precedence

For any setting, configuration is resolved in the following order (highest priority wins):

1. **Explicit Code** — `configureMongoSingleton(...)` or `getConnection(...)` overrides everything
2. **Environment Variables** — `MONGO_URI` / `MONGODB_URI` / `MONGO_URL` and `MONGO_DATABASE` / `MONGODB_DATABASE`
3. **Config File** — A local or checked-in config file acts as a repo fallback and will never override an environment variable injected by your hosting environment
4. **URI Database Path** — A database name embedded in the URI path (e.g., `mongodb://host/myApp`) supplies the database name if no explicit database key is set above

## Config file

Optional. Powered by [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), you can specify settings in any standard config format:

```js
// mongosingleton.config.js
module.exports = {
  uri: process.env.MONGO_URI, // Default connection URI
  database: 'myApp',         // Default database name
  clients: {                  // Named secondary connections
    analytics: {
      uri: process.env.ANALYTICS_MONGO_URI,
      database: 'events',
    },
  },
};
```

## Using multiple connections

If your app needs to connect to multiple distinct MongoDB clusters, choose between these two approaches:

#### Option A: Named Connection Registry (`getConnection`)

`getConnection` maintains a global registry, ensuring a single shared instance per connection ID across your app.

When defined in your config file (`clients: { analytics: { ... } }`), you can access named connections anywhere with zero setup:

```ts
import { getConnection } from '@notross/mongo-singleton';

// Resolves automatically from config file or MONGO_ANALYTICS_URI
const { collection } = getConnection('analytics');
const events = await collection('events').find().toArray();
```

You can also pass explicit options during setup:

```ts
// Configure once
getConnection('analytics', { 
  connection: process.env.ANALYTICS_URI, 
  database: 'events' 
});

// Access anywhere else
const { collection } = getConnection('analytics');
const account = await collection('accounts').findOne({ id: 123 });
```

> **Automatic Environment Overrides:** Named connections automatically map to upper-cased environment variables. For example, `getConnection('analytics')` checks `MONGO_ANALYTICS_URI` and `MONGO_ANALYTICS_DATABASE` before falling back to your config file.

#### Option B: Instantiate `MongoSingleton` Directly

For completely isolated instances that bypass the global registry, instantiate `MongoSingleton` directly:

```ts
import { MongoSingleton } from '@notross/mongo-singleton';

export const primaryClient = new MongoSingleton({ 
  connection: process.env.PRIMARY_URI, 
  database: 'app' 
});

export const analyticsClient = new MongoSingleton({ 
  connection: process.env.ANALYTICS_URI, 
  database: 'events' 
});

// Usage
const user = await primaryClient.collection('users').findOne({ id: 1 });
```

## Key Handle Exports
`getConnection('name')` returns a `{ collection, db, client }` handle:

- `collection` & `db`: High-level lazy accessors (what you will use 99% of the time).
- `client`: The underlying `MongoSingleton` instance, used for low-level connection lifecycle management or direct driver access.

## One Connection, Many Databases

A single `MongoClient` can safely serve multiple databases on the same cluster—no extra sockets required. The `database` parameter acts as the default for an instance and can be overridden per call:

```ts
import { collection, db } from '@notross/mongo-singleton';

// Uses the default database from environment / config
const defaultUsers = await collection('users');

// Targets a different database using the same connection pool
const analyticsEvents = await collection('events', { database: 'analytics' });
const analyticsDb = db('analytics');
```

---

## Logging

Powered by [Pino](https://getpino.io). Pass your application's existing Pino logger (or a `.child()` logger) so every database log flows through your primary log sink:

```ts
import pino from 'pino';
import { MongoSingleton } from '@notross/mongo-singleton';

const logger = pino({ level: 'debug' });

const client = new MongoSingleton({
  connection: process.env.MONGO_URI,
  logger,
});
```

* **Default Behavior**: Omitting `logger` uses a shared internal Pino instance (respects `LOG_LEVEL` environment variable, defaulting to `info`).
* **Disable Logging**: Pass `logger: false` to disable logging entirely for that instance.
* **Instance Isolation**: Logger settings are scoped per instance and will never mutate other connections.

---

## Graceful Shutdown

To automatically handle process termination signals, register shutdown hooks during application boot:

```ts
import { registerShutdown } from '@notross/mongo-singleton';

// Closes all getConnection() registries and the default root client on SIGINT / SIGTERM
registerShutdown();
```

---

## API Reference

### `MongoSingleton`

```ts
new MongoSingleton(opts?: MongoSingletonOptions);
```

#### Types

```ts
type MongoSingletonOptions = {
  connection?: ConnectionInput;
  database?: string;
  clientOptions?: mongodb.MongoClientOptions;
  logger?: import('pino').Logger | false;
};

type ConnectionInput = ConnectionProps | SparseConnectionProps | string;

type ConnectionProps = {
  prefix: string; // e.g., "mongodb://" or "mongodb+srv://"
  username: string;
  password: string;
  host: string;
  port?: number;
  defaultauthdb?: string;
  authSource?: string;
  options?: URLSearchParams;
};

type SparseConnectionProps = { uri: string };
```

#### Instance Methods & Properties

* **`collection<T>(name, opts?)`**: Returns a dual-mode collection proxy. Supports direct access, `await`, or `.then()` chaining. Set `opts.database` to target a different database on the same connection.
* **`db(database?)`**: Returns a `Db` instance for the specified database or falls back to the instance default.
* **`connect()`**: Explicitly triggers and awaits the database connection. *(Optional—connections initialize lazily on first operation).*
* **`disconnect()`**: Closes the active driver connection and resets internal state for subsequent lazy reconnection.
* **`client`**: Accesses the raw `mongodb.MongoClient` instance (created lazily on first access).
* **`status`**: Current connection state: `'disconnected' | 'connecting' | 'connected' | 'error'`.
* **`error`**: The last encountered connection error, if any.

---

### Root Exports

Bound to a default `MongoSingleton` instance that lazily resolves configuration on first access:

* **`collection<T>(name, opts?)`**: Top-level collection helper.
* **`db(database?)`**: Top-level database helper.
* **`connect()`**: Explicitly pre-warms the default connection.
* **`configureMongoSingleton(opts)`**: Programmatically configures the root instance.
* **`getConnection(id, opts?)`**: Retrieves or creates a named connection instance.
* **`disconnectAll()`**: Disconnects all active named connections and the root instance.
* **`registerShutdown(...extraClients)`**: Attaches process event listeners for graceful cleanup.

---

## Migrating from v2

This release introduces breaking structural and operational updates:

* **`useClient` renamed to `getConnection`**: Renamed to clarify that the registry manages underlying connections rather than single-database accessors. Returns `{ client, collection, db }`.
* **Optional Default Database**: `database` is no longer required in constructor options and can be specified or overridden per `collection()` or `db()` call.
* **Pino Logger Injection**: Replaced the previous global logger with Pino dependency injection via the `logger` option. Logging configurations are now scoped per instance.
* **Real Connection Rebuilding**: Calling `init()` now dismantles and rebuilds the underlying `MongoClient` connection instead of updating metadata fields over a stale socket. `configure(clientOptions)` has been removed; use `configureMongoSingleton(opts)` for root updates.
* **Removed Legacy Methods**: `getDb` and `connectedDb` have been removed in favor of `await mongoClient.connect()`.
* **Removed `mongoClient.database`**: Deprecated in favor of multi-database `db()` and `collection()` calls.
* **Dual-Mode Collection Proxies**: `collection()` now returns a proxy wrapper around `mongodb.Collection`. It supports direct calls, `await`, or promise chaining while preserving standard property lookups and `instanceof mongodb.Collection` behavior.