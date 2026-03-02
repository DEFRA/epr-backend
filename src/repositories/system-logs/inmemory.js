/** @import {SystemLog} from './port.js' */

/** Encode a numeric ID as a 24-char hex string (matching ObjectId format) */
const toHexCursor = (id) => id.toString(16).padStart(24, '0')

/** Decode a 24-char hex cursor back to a numeric ID */
const fromHexCursor = (cursor) => Number.parseInt(cursor, 16)

/**
 * @returns {import('./port.js').SystemLogsRepositoryFactory}
 */
export function createSystemLogsRepository() {
  /** @type {Array<SystemLog & { _internalId: number }>} */
  const storage = []
  let nextId = 1

  return () => {
    return {
      async insert(systemLog) {
        const id = nextId
        nextId++
        storage.push({ ...systemLog, _internalId: id })
      },

      async findByOrganisationId({ organisationId, limit, cursor }) {
        let results = storage.filter(
          (payload) => payload.context?.organisationId === organisationId
        )

        // Sort by internal ID descending (newest first)
        results.sort((a, b) => b._internalId - a._internalId)

        if (cursor) {
          const cursorId = fromHexCursor(cursor)
          results = results.filter((item) => item._internalId < cursorId)
        }

        const hasMore = results.length > limit
        const page = hasMore ? results.slice(0, limit) : results

        return {
          systemLogs: page.map(({ _internalId, ...rest }) => rest),
          hasMore,
          nextCursor: hasMore ? toHexCursor(page.at(-1)._internalId) : null
        }
      }
    }
  }
}
