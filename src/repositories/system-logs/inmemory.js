/** @import {SystemLog} from './port.js' */

import {
  SUMMARY_LOG_SUB_CATEGORY,
  SUMMARY_LOG_SUBMIT_ACTION
} from '#root/auditing/summary-logs.js'
import { buildPage } from './pagination.js'

/** Encode a numeric ID as a 24-char hex string (matching ObjectId format) */
const toHexCursor = (id) => id.toString(16).padStart(24, '0')

/** Decode a 24-char hex cursor back to a numeric ID */
const fromHexCursor = (cursor) => Number.parseInt(cursor, 16)

const performInsert = (storage, state) => async (systemLog) => {
  storage.push({ ...systemLog, _internalId: state.nextId })
  state.nextId++
}

const performFind =
  (storage) =>
  async ({ organisationId, userId, subCategory, limit, cursor, direction }) => {
    const isPrev = direction === 'prev'

    let results = storage.filter((item) => {
      if (organisationId && item.context?.organisationId !== organisationId) {
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
  }

const performFindSummaryLogSubmitActors =
  (storage) => async (organisationId) => {
    return storage
      .filter(
        (item) =>
          item.context?.organisationId === organisationId &&
          item.event?.subCategory === SUMMARY_LOG_SUB_CATEGORY &&
          item.event?.action === SUMMARY_LOG_SUBMIT_ACTION
      )
      .sort((a, b) => b._internalId - a._internalId)
      .map((item) => ({
        summaryLogId: item.context.summaryLogId,
        createdBy: item.createdBy
      }))
  }

/**
 * @returns {import('./port.js').SystemLogsRepositoryFactory}
 */
export function createSystemLogsRepository() {
  /** @type {Array<SystemLog & { _internalId: number }>} */
  const storage = []
  const state = { nextId: 1 }

  return () => ({
    insert: performInsert(storage, state),
    find: performFind(storage),
    findSummaryLogSubmitActors: performFindSummaryLogSubmitActors(storage)
  })
}
