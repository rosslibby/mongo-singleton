import * as mongodb from 'mongodb';
import { LazyCollection } from './types';

/**
 * Wraps a real `Collection` so it works as three equally-valid call styles:
 *
 *   collection('users').findOne(...)                       // direct
 *   const users = await collection('users');                // await-to-value
 *   collection('users').then((users) => users.findOne(...)) // .then chain
 *
 * The `.then()` trap MUST resolve with `target` (the real, plain collection)
 * and never with the proxy itself. Resolving a promise with a thenable value
 * makes the engine "adopt" it by calling `.then()` on it again — resolving
 * with the proxy (which is itself thenable) recreates that same thenable on
 * every step, so the adoption never bottoms out: it hangs forever rather
 * than erroring, since it isn't a same-value self-reference the spec's
 * cycle guard would catch. Resolving with the plain `target` breaks the
 * cycle since it has no `.then` of its own. Verified directly before
 * shipping — this failure mode is silent otherwise.
 */
export function makeLazyCollection<T extends mongodb.Document = mongodb.Document>(
  real: mongodb.Collection<T>,
): LazyCollection<T> {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (
          onFulfilled?: ((value: mongodb.Collection<T>) => unknown) | null,
          onRejected?: ((reason: unknown) => unknown) | null,
        ) => Promise.resolve(target).then(onFulfilled, onRejected);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as LazyCollection<T>;
}
