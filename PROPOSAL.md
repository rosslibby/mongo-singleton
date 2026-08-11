# @notross/mongo-singleton — Redesign Proposal

## TL;DR

Keep the goal ("plug-and-play MongoDB client management with reusable connections"), but rebuild the internals. The current implementation has a few real bugs, some accidental complexity, and a config story that requires boilerplate the package's own pitch says it shouldn't need. Below: what's actually wrong today, then a proposed v3 architecture that adds `cosmiconfig` + env-var zero-config resolution, replaces the bespoke logger with Pino, and removes a fair amount of indirection.

This is written as a from-scratch redesign, but almost none of it requires a new repo — it's a `src/` rewrite behind the same package name, released as a major version bump (breaking changes are called out explicitly).

> **Note:** implementation happened in conversation after this document was written, and a few names below were refined along the way — `useClient` shipped as `getConnection` (the registry returns a *connection*, and "client" read to Ross as a per-database accessor), and the `configure(clientOptions)` method described in 3.5/3.9 was dropped as redundant with `init({ clientOptions })`, replaced by a top-level `configureMongoSingleton(opts)` for reconfiguring the default instance. Part 1's bug descriptions still refer to the actual v2 code and are accurate as written; it's Part 3's proposed-design snippets that use the pre-rename names. See `README.md` for the shipped API.

---

## Part 1: What's actually wrong with the current implementation

> **Correction:** an earlier draft of this document claimed the README's quickstart was broken because `collection()`/`db()` never call `.connect()`, and described a related "race condition" in `MongoSingleton.connect()`. I verified both against the installed driver (v6.18) directly — created a `MongoClient` against an unreachable port, skipped `.connect()` entirely, and called `.findOne()` — and the driver connected lazily on the first operation (`MongoServerSelectionError: connect ECONNREFUSED`, not an immediate "must be connected" guard error). Both claims were wrong and are removed below. Thanks to Ross for catching this from real usage before I shipped it as fact.

### 1.1 Logging is shared *global* mutable state

`initializeLogging()` (`src/mongo-singleton.ts:84`) calls `logger.toggleLogging(...)` and `logger.setLevels(...)` on the **module-level singleton** exported by `@notross/node-client-logger`. Every `MongoSingleton` instance — including every client created through `useClient()` — mutates the *same* global logger. If `useClient('a', { logging: true })` and `useClient('b', { logging: false })` both run, whichever initializes last wins for both. There's no way to give two clients independent log behavior, despite the API shape (`logging`/`logLevels` per connection) implying you can.

### 1.2 Connection string building is unsafe

`buildConnectionString()` (`src/utils.ts:18`) string-concatenates `username`/`password`/`host` directly into the URI with no escaping. A password containing `@`, `:`, `/`, or `%` silently produces a malformed URI (or a *wrong but valid-looking* one, which is worse). This needs `encodeURIComponent` at minimum, ideally built via `URL`. This one isn't a driver-behavior claim — it's directly visible in the code, no test needed to confirm it.

### 1.3 `client` vs `database` are conflated

A `MongoSingleton` bundles one `MongoClient` with exactly one fixed database name. But a single `MongoClient`/connection pool can safely serve many databases on the same cluster (`client.db('other')` is free — no new sockets). Today, needing a second database on the *same* cluster means spinning up an entire second `MongoSingleton`, i.e., a second connection pool, for no reason. The README's own "multiple clients" example (`useClient('client-a')`, `useClient('client-b')`) conflates "distinct connection" with "distinct database," which will push users toward wasteful over-connecting. This is a design opinion, not a bug — the current behavior works, it's just more expensive than it needs to be for the "different database, same cluster" case.

### 1.4 Accidental complexity

- `mongo-singleton.ts` binds nearly every method in the constructor and re-exposes it as a same-named public property (`public collection: GetCollection; ... this.collection = this.getCollection.bind(this)`), backed by a parallel set of function-type aliases in `types.ts` (`GetCollection`, `SetConfig`, `InitClient`, `ConnectAndGetDb`, `GetDatabase`) that exist *only* to type those properties. Class-field arrow functions (`collection = (name: string) => {...}`) give the same "safe to destructure" behavior with far less ceremony and no parallel type layer.
- `clients.ts` implements the client registry as two cooperating classes (`State`, `Stateful`) with their own bind-in-constructor pattern, to do what amounts to "get from a Map, or create-and-store if missing." A `Map<string, MongoSingleton>` and one factory function is the whole thing.
- `configure`/`setConfig` is private, then re-exposed publicly under a different name via binding — just make it public as `configure` directly.

### 1.5 Loose typing

`public error?: any = null;` is both optional *and* nullable (redundant) and typed `any` (loses all safety) — should be `Error | null`. `getCollection` returns `Collection<Document>` unconditionally; there's no way to get a typed collection (`collection<User>('users')`).

### 1.6 No tests, no CI

There's no test script, no test framework, and no CI workflow in the repo. This is also exactly why the false claims corrected above got as far as a written document instead of being caught immediately — worth internalizing as the actual argument for adding tests, more than any specific bug.

---

## Part 2: What's good and should survive the rewrite

- The core pitch is right and worth keeping: shared/reusable connections, a registry for multiple named clients, `db`/`collection` convenience helpers exported straight from the package root, TypeScript-first.
- Accepting either a raw URI string or structured connection parts is a genuinely nice ergonomic touch — keep it, just fix the string-building (1.2).
- The synchronous `collection()`/`db()` API, and the fact that no explicit `connect()` call is required before using them, is correct as designed — the driver already handles lazy connection per-operation. Nothing here needs a wrapper.
- The dual ESM/CJS build is fine in principle; the hand-rolled `prepare-package.ts` + two `tsconfig`s work but are more moving parts than needed (see Part 5).

---

## Part 3: Proposed architecture

### 3.1 Design goals, in priority order

1. **Zero-config works.** `import { collection } from '@notross/mongo-singleton'` and calling `collection('users').findOne(...)` should succeed with nothing else written, as long as *something* — an env var or a config file — describes where Mongo is. This is the actual "plug and play" bar. (Connection itself is already lazy at the driver level, per the correction above — the gap today is *configuration*, not connection timing.)
2. **One connection per cluster, many databases per connection.** Multiple logical databases on the same URI should never require multiple `MongoClient`s.
3. **Bring-your-own logger.** Accept a Pino instance (or child logger) from the host app; only construct a default Pino instance if none is given. No global mutable log state.
4. **Small surface, few abstractions.** Prefer a Map and a function over a class hierarchy when they do the same job.

### 3.2 Config resolution (cosmiconfig + env)

New module, `src/config.ts`, replacing the current hardcoded `defaultConfig`:

```ts
import { cosmiconfigSync } from 'cosmiconfig';

const explorer = cosmiconfigSync('mongoSingleton', {
  searchPlaces: [
    'package.json',            // "mongoSingleton" key
    '.mongosingletonrc',
    '.mongosingletonrc.json',
    '.mongosingletonrc.yaml',
    '.mongosingletonrc.yml',
    '.mongosingletonrc.js',
    '.mongosingletonrc.cjs',
    'mongosingleton.config.js',
    'mongosingleton.config.cjs',
    'mongosingleton.config.mjs',
  ],
});

export type ResolvedConfig = {
  uri: string;
  database: string;
  clientOptions?: mongodb.MongoClientOptions;
  clients?: Record<string, { uri: string; database: string }>;
  logger?: 'pino' | false;
  logLevel?: string;
};

let cached: ResolvedConfig | null | undefined;

export function resolveConfig(): ResolvedConfig | null {
  if (cached !== undefined) return cached;

  const fileResult = explorer.search();
  const fileConfig = fileResult?.config as Partial<ResolvedConfig> | undefined;

  const envUri =
    process.env.MONGO_URI ??
    process.env.MONGODB_URI ??
    process.env.MONGO_URL;
  const envDb = process.env.MONGO_DATABASE ?? process.env.MONGODB_DATABASE;

  const uri = fileConfig?.uri ?? envUri;
  const database = fileConfig?.database ?? envDb;

  cached = uri && database
    ? { uri, database, ...fileConfig }
    : null;

  return cached;
}
```

Precedence, highest to lowest:
1. Explicit `.init({ connection, database })` / `new MongoSingleton({...})` call — always wins, always allowed, never blocked by config.
2. Config file (via `cosmiconfig`) — supports a `clients: { ... }` map so `useClient('analytics')` can resolve **with zero code-side setup at all**, matching the "multiple distinct connections" pitch directly.
3. Env vars: `MONGO_URI` / `MONGODB_URI` / `MONGO_URL` (covers common hosting-provider conventions), `MONGO_DATABASE` / `MONGODB_DATABASE`.
4. Nothing found → the root-level `db`/`collection` exports throw a clear, actionable error on first use ("No MongoDB connection configured. Set MONGO_URI/MONGO_DATABASE, add a mongosingleton.config file, or call mongoClient.init(...)") instead of silently defaulting to `mongodb://localhost:27017` (the current behavior, which fails confusingly in production rather than obviously in dev).

`cosmiconfigSync` (not the async explorer) is the right choice here specifically because the root-level `db`/`collection`/`mongoClient` exports need to resolve config without forcing every consumer into a top-level `await`. It's a one-time, cached filesystem read at first use — not a hot path.

### 3.3 Connection stays exactly as lazy as it is today

No change needed here, and nothing to build — this was the point of the correction at the top of the document. `collection()`/`db()` stay synchronous, returning real driver objects with no wrapper. The driver connects on first operation on its own; `mongoClient.connect()` remains available for callers who want to *explicitly* pre-warm the connection at boot (health checks, failing fast on bad credentials before serving traffic) or who need the event-listener wiring (`connectionReady`, `serverHeartbeatFailed`, etc.) — both genuinely useful, just optional, exactly as they are today.

### 3.4 Decoupling client (connection) from database (1.3)

```ts
const client = new MongoSingleton({ connection: process.env.MONGO_URI });
// no `database` at construction time

client.collection('users');                  // uses default database from config/env
client.collection('logs', { database: 'analytics' }); // same connection, different db
```

`useClient(id)` continues to give you one connection per id; picking a *database* on that connection becomes a per-call option instead of forcing a whole new client. Multiple *clusters* (genuinely different URIs) still get separate `useClient` entries, which is the case where a new connection is actually warranted.

### 3.5 Pino instead of the bespoke logger

```ts
import pino, { type Logger } from 'pino';

export type MongoSingletonOptions = {
  connection: ConnectionOptions;
  database?: string;
  clientOptions?: mongodb.MongoClientOptions;
  logger?: Logger | false; // pass your app's logger, or `false` to disable entirely
};

class MongoSingleton {
  private log: Logger | undefined;

  constructor(opts?: MongoSingletonOptions) {
    this.log = opts?.logger === false
      ? undefined
      : (opts?.logger ?? pino({ level: process.env.LOG_LEVEL ?? 'info' })).child({
          module: 'mongo-singleton',
        });
    ...
  }
}
```

This directly fixes 1.1 (no more shared global logger state — each `MongoSingleton` instance holds its own logger reference or child logger) and matches how most Node services already do logging: one Pino instance created at app boot, passed down, with `.child({...})` for scoping. `useClient(id, { logger })` can pass `logger.child({ client: id })` automatically so multi-client logs are attributable without any extra work. `pino` becomes a direct dependency; drop `@notross/node-client-logger` entirely.

### 3.6 Simplified registry (`clients.ts`)

```ts
const registry = new Map<string, MongoSingleton>();

export function useClient(id: string, opts?: MongoSingletonOptions): UseClientResponse {
  let client = registry.get(id);
  if (!client) {
    client = new MongoSingleton(opts ?? resolveClientConfig(id));
    registry.set(id, client);
  } else if (opts) {
    // matches current "does not silently overwrite" behavior, but says why
    client.log?.warn({ id }, 'useClient called again with new options; ignored — call client.init(...) to reconfigure');
  }
  return { client, collection: client.collection, db: client.db };
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...registry.values()].map((c) => c.disconnect()));
  registry.clear();
}
```

`resolveClientConfig(id)` looks up `id` in the config file's `clients` map from 3.2 — this is what makes `useClient('analytics')` work with zero code-side `init()` when it's declared in a config file. `disconnectAll()` is new and fills a real gap: today there's no way to close every registered client at once, which matters for graceful shutdown and for tests.

### 3.7 Graceful shutdown helper (new, small, optional)

```ts
import { registerShutdown } from '@notross/mongo-singleton';
registerShutdown(); // hooks SIGINT/SIGTERM, calls disconnectAll(), re-raises the signal
```

Opt-in, not automatic — auto-hooking process signals from inside a library without being asked is the kind of surprising side effect that causes hard-to-debug issues in apps that already manage their own shutdown sequence.

### 3.8 Safer connection strings (1.3)

```ts
export function buildConnectionString(props: ConnectionProps): string {
  const { prefix, username, password, host, port, defaultauthdb, authSource, options } = props;
  const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  const portPart = port ? `:${port}` : '';
  const url = new URL(`${prefix}${auth}@${host}${portPart}/${defaultauthdb ?? ''}`);
  if (authSource) url.searchParams.set('authSource', authSource);
  if (options) for (const [k, v] of options) url.searchParams.set(k, v);
  return url.toString();
}
```

### 3.9 Typed collections (1.5)

```ts
type User = { email: string; name: string };
const users = mongoClient.collection<User>('users');
await users.findOne({ email: '...' }); // typed
```

---

## Part 4: Example — the whole point, end to end

**Zero config, env vars only** (`MONGO_URI` + `MONGO_DATABASE` set in the environment):

```ts
import { collection } from '@notross/mongo-singleton';

const user = await collection('users').findOne({ email: 'john.doe@gmail.com' });
```

No `init()`, no `connect()`, nothing imported but `collection`. That's the bar goal 3.1(#1) is aiming for, and it's a straightforwardly stronger opening pitch for the README than what exists today.

**Multiple clients, declared entirely in config**, `mongosingleton.config.js`:

```js
module.exports = {
  clients: {
    primary: { uri: process.env.MONGO_URI, database: 'app' },
    analytics: { uri: process.env.ANALYTICS_MONGO_URI, database: 'events' },
  },
};
```

```ts
import { useClient } from '@notross/mongo-singleton';

const { collection: orders } = useClient('primary');
const { collection: events } = useClient('analytics');
```

---

## Part 5: Smaller, lower-priority recommendations

- **Testing**: add `vitest` + `mongodb-memory-server` for real integration tests (spin up an ephemeral Mongo, exercise `connect`/multi-client/disconnect, and lock in actual driver behavior like the lazy-connect-on-first-operation point above so it doesn't need re-verifying by hand next time).
- **CI**: a basic GitHub Actions workflow (`build`, `test`, `typecheck`) — there's currently none.
- **Build tooling**: the two-tsconfig + hand-rolled `prepare-package.ts` approach works but is more to maintain than needed; `tsup` produces dual ESM/CJS + `.d.ts` output from one config and would let you delete `prepare-package.ts`, `tsconfig.cjs.json`, and `tsconfig.esm.json`. Not urgent, just less bespoke machinery to carry.
- **`mongodb` as a peer dependency**: since consumers already need `mongodb`'s types to use the driver objects this package hands back, consider `peerDependencies: { mongodb: "^6.0.0" }` (with it also in `devDependencies` for local building) instead of a hard `dependencies` entry — avoids two copies of the driver in a consumer's tree if they also depend on it directly, which is likely given the package hands back real driver objects.

---

## Part 6: Migration path

This is a breaking release (v3) given: dropped `@notross/node-client-logger` dependency (replaced by Pino), `database` moves from required constructor field to per-call option, and the `types.ts` function-alias exports (`GetCollection`, `SetConfig`, etc.) go away in favor of direct method types. `collection()`/`db()` keep returning plain driver objects exactly as they do today — no signature change there.

Suggested rollout:
1. Land Part 3.2 + 3.4 (cosmiconfig/env resolution + client/db decoupling) — the two things that actually change what the package can do.
2. Land Part 3.5 (Pino) as its own change, since it's an independent, easily-reviewed swap and fixes a genuine bug (1.1, shared global logger state).
3. Land Part 3.6–3.8 (registry simplification, shutdown helper, safe URI building) — cleanup, low risk.
4. Update README to lead with the zero-config example from Part 4; move the manual `ConnectionProps`/multi-client walkthrough below it, since it becomes the advanced path rather than the default one.
5. Publish as `3.0.0` with a short migration note covering the breaking changes above.

Want me to start on any of this? I'd suggest starting with 3.2 (config resolution), since it's the one piece that actually delivers on "no boilerplate" — Pino and the registry cleanup are comparatively mechanical once that lands.
