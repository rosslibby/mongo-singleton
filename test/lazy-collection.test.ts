import { describe, expect, it } from 'vitest';
import { makeLazyCollection } from '../src/lazy-collection';

// A minimal stand-in for mongodb.Collection: enough surface to prove method
// calls, `this` binding, and property access all pass through the proxy
// correctly, without needing a real driver connection for what's really a
// pure-JS-semantics test.
function fakeCollection() {
  return {
    collectionName: 'users',
    findOne: async function (query: Record<string, unknown>) {
      // Returning `this === target` proves the proxy preserves the real
      // receiver instead of `this` becoming the proxy or `undefined`.
      return { query, isOriginalThis: this === real };
    },
  };
}

let real: ReturnType<typeof fakeCollection>;

describe('makeLazyCollection', () => {
  it('supports direct method calls, same as a plain collection', async () => {
    real = fakeCollection();
    const lazy = makeLazyCollection(real as never);
    const result = await lazy.findOne({ a: 1 });
    expect(result).toEqual({ query: { a: 1 }, isOriginalThis: true });
  });

  it('supports await-to-value, resolving to a usable collection', async () => {
    real = fakeCollection();
    const lazy = makeLazyCollection(real as never);
    const resolved = await lazy;
    expect(typeof resolved.findOne).toBe('function');
    const result = await resolved.findOne({ b: 2 });
    expect(result).toEqual({ query: { b: 2 }, isOriginalThis: true });
  });

  it('supports .then() chaining', async () => {
    real = fakeCollection();
    const lazy = makeLazyCollection(real as never);
    const result = await lazy.then((c) => c.findOne({ c: 3 }));
    expect(result).toEqual({ query: { c: 3 }, isOriginalThis: true });
  });

  it('resolves to the plain underlying object, not a re-thenable wrapper', async () => {
    real = fakeCollection();
    const lazy = makeLazyCollection(real as never);
    const resolved = await lazy;
    expect((resolved as { then?: unknown }).then).toBeUndefined();
  });

  it('never hangs: awaiting the thenable settles within a bounded time', async () => {
    // Regression guard for a real footgun found during implementation:
    // resolving `.then()` with the proxy itself (instead of the plain
    // target) makes the engine's promise-adoption procedure recurse
    // forever, since a thenable resolved with another thenable gets
    // re-adopted rather than erroring. That failure mode is a silent hang,
    // not a thrown error, so a timeout is the only way to catch it.
    real = fakeCollection();
    const lazy = makeLazyCollection(real as never);

    const settled = await Promise.race([
      lazy.then(() => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 500)),
    ]);

    expect(settled).toBe('settled');
  });

  it('forwards plain property access transparently', () => {
    real = fakeCollection();
    const lazy = makeLazyCollection(real as never);
    expect(lazy.collectionName).toBe('users');
  });
});
