import { describe, expect, it, vi } from 'vitest'

import { mapWithConcurrency } from './map-with-concurrency.js'

describe('map-with-concurrency', () => {
  it('returns results in input order even when later items settle first', async () => {
    const items = [0, 1, 2, 3]
    /** @type {Array<() => void>} */
    const release = []
    const gated = items.map(
      (item) =>
        new Promise((resolve) => {
          release[item] = () => resolve(item * 10)
        })
    )

    const resultPromise = mapWithConcurrency(items, 10, (item) => gated[item])

    // Settle the calls in reverse, so the last item finishes before the first.
    for (let item = items.length - 1; item >= 0; item--) {
      release[item]()
    }

    await expect(resultPromise).resolves.toEqual([0, 10, 20, 30])
  })

  it('runs at most `limit` calls concurrently when items exceed the limit', async () => {
    const items = Array.from({ length: 25 }, (_, index) => index)
    let inFlight = 0
    let maxInFlight = 0

    const results = await mapWithConcurrency(items, 10, async (item) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
      return item
    })

    expect(maxInFlight).toBe(10)
    expect(results).toEqual(items)
  })

  it('rejects when a mapped call rejects', async () => {
    const items = [1, 2, 3]

    await expect(
      mapWithConcurrency(items, 2, async (item) => {
        if (item === 2) {
          throw new Error('boom')
        }
        return item
      })
    ).rejects.toThrow('boom')
  })

  it('resolves to an empty array for empty input without calling fn', async () => {
    const fn = vi.fn()

    await expect(mapWithConcurrency([], 10, fn)).resolves.toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('clamps the worker count to the item count when limit exceeds it', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 100, async (n) => n * 2)

    expect(results).toEqual([2, 4, 6])
  })

  it('runs a single worker when limit is below one', async () => {
    /** @type {number[]} */
    const order = []

    const results = await mapWithConcurrency([1, 2, 3], 0, async (n) => {
      order.push(n)
      return n
    })

    expect(results).toEqual([1, 2, 3])
    // One worker means the calls run strictly in sequence.
    expect(order).toEqual([1, 2, 3])
  })

  it('passes the zero-based index to fn', async () => {
    /** @type {Array<[string, number]>} */
    const seen = []

    await mapWithConcurrency(['a', 'b', 'c'], 1, async (item, index) => {
      seen.push([item, index])
      return item
    })

    expect(seen).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2]
    ])
  })
})
