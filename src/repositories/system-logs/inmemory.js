/** @import {SystemLog} from './port.js' */

import { buildPage } from './pagination.js'

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

      async find({
        organisationId,
        userId,
        subCategory,
        limit,
        cursor,
        direction
      }) {
        const isPrev = direction === 'prev'

        let results = storage.filter((item) => {
          if (
            organisationId &&
            item.context?.organisationId !== organisationId
          ) {
            return false
          }
          if (userId && item.createdBy?.id !== userId) {
            return false
          }
          if (subCategory && item.event?.subCategory !== subCategory) {
            return false
          }
          return true
        })

        if (cursor) {
          const cursorId = fromHexCursor(cursor)
          results = results.filter((item) =>
            isPrev ? item._internalId > cursorId : item._internalId < cursorId
          )
        }

        // Forward: newest first. Backward: oldest first, so the slice keeps
        // the rows nearest the cursor; reversed afterwards for display.
        results.sort((a, b) =>
          isPrev ? a._internalId - b._internalId : b._internalId - a._internalId
        )

        const { page, hasNext, hasPrev, nextCursor, prevCursor } = buildPage(
          results,
          {
            limit,
            isPrev,
            hasCursor: Boolean(cursor),
            toCursor: (item) => toHexCursor(item._internalId)
          }
        )

        return {
          systemLogs: page.map(({ _internalId, ...rest }) => rest),
          hasNext,
          hasPrev,
          nextCursor,
          prevCursor
        }
      },

      async findSubmittersBySummaryLogIds(summaryLogIds) {
        /** @type {Map<string, import('./port.js').SystemLogSubmitter>} */
        const submitters = new Map()
        if (summaryLogIds.length === 0) {
          return submitters
        }
        const idSet = new Set(summaryLogIds)
        for (const item of storage) {
          if (
            item.event?.subCategory === 'summary-log' &&
            item.event?.action === 'submit' &&
            idSet.has(item.context?.summaryLogId)
          ) {
            const createdBy = /** @type {Record<string, string>} */ (
              item.createdBy
            )
            submitters.set(item.context.summaryLogId, {
              id: createdBy.id,
              name: createdBy.email ?? createdBy.name
            })
          }
        }
        return submitters
      }
    }
  }
}
