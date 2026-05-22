/**
 * Slice an over-fetched (`limit + 1`) result set into a page and derive the
 * bidirectional pagination metadata.
 *
 * Rows arrive in the query's natural order: newest-first for a forward query,
 * oldest-first for a backward (`isPrev`) query. A backward page is reversed so
 * the returned page is always newest-first.
 *
 * @template T
 * @param {T[]} rows - up to `limit + 1` rows in the query's natural order
 * @param {{
 *   limit: number,
 *   isPrev: boolean,
 *   hasCursor: boolean,
 *   toCursor: (row: T) => string
 * }} options
 * @returns {{
 *   page: T[],
 *   hasNext: boolean,
 *   hasPrev: boolean,
 *   nextCursor: string | null,
 *   prevCursor: string | null
 * }}
 */
export function buildPage(rows, { limit, isPrev, hasCursor, toCursor }) {
  const hasExtra = rows.length > limit
  const trimmed = hasExtra ? rows.slice(0, limit) : rows
  const page = isPrev ? [...trimmed].reverse() : trimmed

  const hasNext = isPrev ? page.length > 0 : hasExtra
  const hasPrev = isPrev ? hasExtra : hasCursor

  const cursorFor = (visible, row) => (visible && row ? toCursor(row) : null)

  return {
    page,
    hasNext,
    hasPrev,
    nextCursor: cursorFor(hasNext, page.at(-1)),
    prevCursor: cursorFor(hasPrev, page[0])
  }
}
