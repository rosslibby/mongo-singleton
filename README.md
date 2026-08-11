# @notross/mongo-singleton

Zero-config, plug-and-play MongoDB client management for Node.js. Point it at a connection with an env var (or nothing at all, if you've got a config file), and import `collection`/`db` straight from the package root — no `init()` call required.

## Key Features
- ✅ **Zero-config**: reads `MONGO_URI`/`MONGO_DATABASE` (or a config file) automatically — no boilerplate to get started
- ✅ Works with connection URIs, structured connection parts, or `MongoClientOptions`
- ✅ Support for multiple named, independently-configured connections (`getConnection`)
- ✅ One connection serves many databases — no need for a second connection just to reach a second database on the same cluster
- ✅ Everything is lazy: clients aren't constructed until first use, and the driver connects on first operation
- ✅ `collection()` works as a direct call, an `await`-to-value, or a `.then()` chain — whichever reads best at the call site
- ✅ [Pino](https://getpino.io) logging — bring your own logger, or get a sane default
- ✅ TypeScript support, including generic `collection<T>(name)`
- ✅ Direct access to `db` and `collection` helpers from the package root

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

// all three of these are equivalent — use whichever reads best:
const user = await collection('users').findOne({ email: 'john.doe@gmail.com' });

const users = await collection('users');
const sameUser = await users.findOne({ email: 'john.doe@gmail.com' });

const getUserByEmail = (email: string) =>
  collection('users').then((users) => users.findOne({ email }));
```

No `init()`, no `connect()`. If `MONGO_URI` includes a database path (as above), you don't even need a separate `MONGO_DATABASE` — it's pulled from the URI. Set both explicitly if you'd rather keep them separate:

```bash
MONGO_URI="mongodb://localhost:27017"
MONGO_DATABASE="myApp"
```

`MONGODB_URI` / `MONGO_URL` and `MONGODB_DATABASE` are also recognized, to match common hosting-provider conventions.

If nothing is configured anywhere, the first `collection()`/`db()`/`connect()` call throws a clear error telling you what to set — never a silent connection to `localhost` or the driver's own `test` database default.

Prefer to configure it from code instead of the environment? One call, at boot:

```ts
import { configureMongoSingleton } from '@notross/mongo-singleton';

configureMongoSingleton({ connection: process.env.MONGO_URI, database: 'myApp' });
```

## Configuration precedence

For a given setting, highest wins:

1. **Explicit code** — `configureMongoSingleton({...})` / `new MongoSingleton({...})` / `mongoClient.init({...})`. Always available, always wins.
2. **Environment variables** — `MONGO_URI` / `MONGODB_URI` / `MONGO_URL`, `MONGO_DATABASE` / `MONGODB_DATABASE`.
3. **Config file** — see below. A checked-in file is a repo default; it deliberately can't override an env var injected by your deploy environment.
4. **The connection URI's own path** — `mongodb://host/myApp` supplies `myApp` as the database if nothing else did.

## Config file

Optional. Powered by [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), so any of these work: a `mongoSingleton` key in `package.json`, `.mongosingletonrc(.json|.yaml|.yml|.js|.cjs)`, or `mongosingleton.config.(js|cjs)`.

```js
// mongosingleton.config.js
module.exports = {
  uri: process.env.MONGO_URI,      // default (unnamed) connection
  database: 'myApp',
  clients: {                       // named connections — see below
    analytics: { uri: process.env.ANALYTICS_MONGO_URI, database: 'events' },
  },
};
```

## Using multiple connections

Two options if your app needs more than one distinct MongoDB connection.

#### Option A: Create your own instances

```ts
import { MongoSingleton } from '@notross/mongo-singleton';

export const clientA = new MongoSingleton({ connection: process.env.URI_A, database: 'dbA' });
export const clientB = new MongoSingleton({ connection: process.env.URI_B, database: 'dbB' });
```

#### Option B: `getConnection` registry

`getConnection` ensures a single instance per connection ID across your app. With a `clients` map in a config file (above), it needs no code-side setup at all:

```ts
import { getConnection } from '@notross/mongo-singleton';

const { collection } = getConnection('analytics'); // resolves from config file — zero args needed
const events = await collection('events').find().toArray();
```

Or pass options explicitly:

```ts
getConnection('client-a', { connection: process.env.URI_A, database: 'dbA' });
getConnection('client-b', { connection: process.env.URI_B, database: 'dbB' });

// elsewhere
const { collection } = getConnection('client-a');
const account = await collection('accounts').findOne({ email, password });
```

Named connections also get a per-id environment override, independent of any config file: `MONGO_<ID>_URI` / `MONGO_<ID>_DATABASE` (id upper-cased, non-alphanumerics collapsed to `_`) — e.g. `getConnection('analytics')` reads `MONGO_ANALYTICS_URI` if set.

> A second `getConnection('client-a', {...})` call does not overwrite an already-created connection. To reconfigure, call `client.init(...)` on the handle's `client` — unlike in v2, this now actually rebuilds the underlying connection.

```ts
const { client } = getConnection('client-a');
client.init({ connection: '...', database: '...' });
```

> Note on naming: `getConnection` returns a `{ client, collection, db }` handle. `client` there is the underlying `MongoSingleton`/driver-managed connection — not a per-database accessor. If you only need to read/write documents, you'll almost always destructure just `collection`/`db` and never touch `client` directly.

## One connection, many databases

A single `MongoClient` can safely serve multiple databases on the same cluster — no new sockets required. `database` is just the *default* for a given instance; override it per call:

```ts
const client = new MongoSingleton({ connection: process.env.MONGO_URI });

client.collection('users');                              // uses the default database
client.collection('events', { database: 'analytics' });  // same connection, different db
```

## Logging

Backed by [Pino](https://getpino.io). Bring your app's own logger (or a `.child(...)` of it) so every `MongoSingleton` instance logs through the same sink your app already uses:

```ts
import pino from 'pino';
import { MongoSingleton } from '@notross/mongo-singleton';

const logger = pino();
const client = new MongoSingleton({ connection: process.env.MONGO_URI, logger });
```

Omit `logger` to get a shared default Pino instance (level from `LOG_LEVEL`, defaulting to `info`), or pass `logger: false` to disable logging for that instance entirely. Each instance gets its own logger reference — configuring one connection's logging never affects another's.

## Graceful shutdown

Optional, opt-in — call once at boot if you want it:

```ts
import { registerShutdown } from '@notross/mongo-singleton';

registerShutdown(); // closes every getConnection()-registered client + the root client on SIGINT/SIGTERM
```

## API Reference

### `MongoSingleton`
```ts
new MongoSingleton(opts?: MongoSingletonOptions);
```

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

Methods:
- `init(opts)` – (Re)initialize — covers both first-time setup and reconfiguration. Safe to call more than once; rebuilds the connection each time.
- `collection<T>(name, opts?)` – Typed, dual-mode collection handle (see call styles above). `opts.database` overrides the instance default.
- `db(database?)` – `Db` handle for `database`, or the instance default.
- `connect()` – Explicitly wait for a connection (not required before `collection()`/`db()` — the driver connects lazily on first operation). Useful for pre-warming at boot or wiring status logging.
- `disconnect()` – Closes the connection and resets state so the next call lazily reconnects.
- `client` – The underlying `mongodb.MongoClient`, created lazily on first access.
- `status` / `error` – Current `'disconnected' | 'connecting' | 'connected' | 'error'` and the last error, if any.

### Root exports

`mongoClient`, `db`, `collection`, `connect`, `configureMongoSingleton` — bound to a single zero-arg `MongoSingleton` instance, resolved lazily from env/config on first use.

`getConnection(id, opts?)`, `disconnectAll()`, `registerShutdown(...extraClients)`.

## Migrating from v2

This is a breaking release:
- `useClient` was renamed to `getConnection` — "client" reads as a per-database accessor to some, when what's actually being registered/retrieved is a distinct connection. The returned shape is unchanged (`{ client, collection, db }`).
- `database` moved from a required constructor field to an optional default, overridable per `collection()`/`db()` call.
- Logging changed from a built-in custom logger (`logging`/`logLevels` on connection props) to Pino dependency injection (`logger` option). The old logger mutated a shared global instance across every client — this fixes that.
- `init()` now actually rebuilds the underlying client — previously it silently updated internal fields but kept using the original (stale) `MongoClient`. The separate `configure(clientOptions)` method was removed as redundant (`init({ clientOptions })` covers it); use the new top-level `configureMongoSingleton(opts)` to reconfigure the default instance from code.
- `getDb`/`connectedDb` were removed; use `await mongoClient.connect()` for the same "wait for a real connection" behavior.
- `mongoClient.database` (a cached `Db` field) was removed in favor of `db()`/`collection()`, which support multiple databases per client.
- `collection()` now returns a dual-mode handle (see call styles above) rather than a plain `Collection` — it's a `Proxy` around the real one, so `instanceof mongodb.Collection`, property access, and method calls all behave identically; the only observable differences are an extra frame in stack traces and the added `.then()`.
