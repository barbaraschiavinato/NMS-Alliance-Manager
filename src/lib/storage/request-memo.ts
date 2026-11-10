import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";

// Per-request memoization of whole-document store reads. Without it a single request reads the same JSON document
// (access.json above all) several times, and on Vercel Blob every read is a network round trip.
//
// Scope: route handlers enter one with withRequestMemo(); server component renders get one from React.cache, which
// Next.js creates per request (outside a render React.cache returns a new Map at every call, so nothing is shared).
// Any store write clears the whole scope, because derived values (member names in missions, for example) depend on
// other documents. Every caller receives its own deep copy, so mutating a result never leaks into another caller.
type Memo = Map<string, Promise<unknown>>;

const handlerScope = new AsyncLocalStorage<Memo>();
const renderScope = cache((): Memo => new Map());

function currentMemo(): Memo {
  return handlerScope.getStore() ?? renderScope();
}

export function withRequestMemo<Args extends unknown[], Result>(
  handler: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return (...args) => handlerScope.run(new Map(), () => handler(...args));
}

export async function memoizedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const memo = currentMemo();
  let pending = memo.get(key) as Promise<T> | undefined;
  if (!pending) {
    const loading = load();
    pending = loading;
    memo.set(key, loading);
    // A failed read is not remembered: the next caller tries again.
    loading.catch(() => {
      if (memo.get(key) === loading) memo.delete(key);
    });
  }
  return structuredClone(await pending);
}

export function clearRequestMemo(): void {
  currentMemo().clear();
}
