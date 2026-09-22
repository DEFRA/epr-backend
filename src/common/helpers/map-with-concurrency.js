/**
 * Map over `items`, calling `fn` for each, with at most `limit` calls in flight
 * at any moment, and returning the results in the original input order.
 *
 * A worker pool over a shared index cursor: `limit` workers each pull the next
 * index off the cursor, await `fn`, and repeat until the items are exhausted.
 * The cursor read and the `cursor += 1` that follows are a single synchronous
 * step with no `await` between them, so two workers never claim the same index.
 *
 * Results land at their source index, so ordering is preserved regardless of
 * which call settles first. Failures propagate: if any `fn` rejects, the
 * returned promise rejects (mirroring `Promise.all`).
 *
 * @template T, R
 * @param {readonly T[]} items
 * @param {number} limit - maximum concurrent calls; clamped to [1, items.length]
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export const mapWithConcurrency = async (items, limit, fn) => {
  /** @type {R[]} */
  const results = Array.from({ length: items.length })
  let cursor = 0

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index], index)
    }
  }

  const workerCount = Math.min(Math.max(limit, 1), items.length)
  await Promise.all(Array.from({ length: workerCount }, worker))

  return results
}
