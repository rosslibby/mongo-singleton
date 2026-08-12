import { ConnectionHandle, MongoSingletonOptions } from './types';
import { MongoSingleton } from './mongo-singleton';
import { resolveNamedConnection } from './config';

const registry = new Map<string, MongoSingleton>();

function buildOptions(id: string, opts?: MongoSingletonOptions): MongoSingletonOptions | undefined {
  if (opts?.connection) {
    return opts;
  }

  const resolved = resolveNamedConnection(id);
  if (!resolved) {
    return opts;
  }

  return {
    ...opts,
    connection: resolved.uri,
    database: opts?.database ?? resolved.database,
    clientOptions: opts?.clientOptions ?? resolved.clientOptions,
  };
}

/**
 * Returns the connection registered under `id`, creating it on first call.
 * With no `opts`, resolution falls back to a `clients.<id>` entry in a
 * mongosingleton config file (or its `MONGO_<ID>_URI` env override), then to
 * the same default-connection resolution used by the root client.
 *
 * A second call with `opts` for an already-created id does not overwrite
 * it — call `client.init(opts)` on the returned handle's `client` to
 * reconfigure.
 */
export function getConnection(id: string, opts?: MongoSingletonOptions): ConnectionHandle {
  let client = registry.get(id);

  if (!client) {
    client = new MongoSingleton(buildOptions(id, opts));
    registry.set(id, client);
  } else if (opts) {
    client.log?.warn(
      { connectionId: id },
      `getConnection('${id}') called again with new options; ignored — call client.init(...) to reconfigure`,
    );
  }

  return { client, collection: client.collection, db: client.db };
}

/** Closes every connection created via `getConnection` and clears the registry. */
export async function disconnectAll(): Promise<void> {
  const clients = [...registry.values()];
  registry.clear();
  await Promise.all(clients.map((client) => client.disconnect()));
}
