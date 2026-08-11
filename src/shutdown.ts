import { MongoSingleton } from './mongo-singleton';
import { disconnectAll } from './clients';

let attached = false;

/**
 * Opt-in convenience: on SIGINT/SIGTERM, closes every client created via
 * `useClient`, plus any instances passed explicitly, then exits with the
 * conventional 128+signal code. Call once, at application boot.
 *
 * Not wired up automatically — a library silently hooking process signals
 * is exactly the kind of surprising side effect that fights an app's own
 * shutdown sequence, so this only runs if you opt in.
 */
export function registerShutdown(...clients: MongoSingleton[]): void {
  if (attached) {
    return;
  }
  attached = true;

  const shutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
    try {
      await Promise.all([disconnectAll(), ...clients.map((client) => client.disconnect())]);
    } finally {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
