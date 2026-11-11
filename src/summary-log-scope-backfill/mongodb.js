import Boom from '@hapi/boom'

import { COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'

/** @import { Db } from 'mongodb' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationNumber } from '#domain/organisations/numbers.js' */
/** @import { SummaryLog } from '#domain/summary-logs/model.js' */
/** @import { SummaryLogId } from '#domain/summary-logs/ids.js' */

/**
 * The fields a summary log stored before summary logs were scoped by
 * accreditation and year may lack. An accreditation is given by its id and
 * number together, both `null` for a registered-only registration.
 *
 * @typedef {(
 *   | { accreditationId: string, accreditationNumber: AccreditationNumber }
 *   | { accreditationId: null, accreditationNumber: null }
 *   | {}
 * ) & { year?: Year }} SummaryLogScope
 */

/**
 * @typedef {Object} UnscopedSummaryLogs
 * @property {() => Promise<SummaryLogId[]>} findIdsWithoutScope - summary logs lacking an accreditation number or a year
 * @property {(id: SummaryLogId) => Promise<{ summaryLog: SummaryLog, version: number } | null>} findById
 * @property {(id: SummaryLogId, version: number, scope: SummaryLogScope) => Promise<void>} assignScope - refuses a summary log that has moved on from `version` or already holds a field of `scope`
 */

const WITHOUT_SCOPE = {
  $or: [
    { accreditationNumber: { $exists: false } },
    { year: { $exists: false } }
  ]
}

/**
 * The summary logs collection as the backfill reads and writes it, outside
 * the summary logs repository because only this one-off migration needs it.
 *
 * @param {Db} db
 * @returns {UnscopedSummaryLogs}
 */
export const createUnscopedSummaryLogs = (db) => {
  /** @type {import('mongodb').Collection<any>} */
  const collection = db.collection(COLLECTION_NAME)

  return {
    findIdsWithoutScope: async () => {
      const docs = await collection
        .find(WITHOUT_SCOPE, { projection: { _id: 1 } })
        .toArray()
      return docs.map((doc) => doc._id)
    },

    findById: async (id) => {
      const doc = await collection.findOne({ _id: id })
      if (!doc) {
        return null
      }
      const { _id, version, ...summaryLog } = doc
      return { summaryLog, version }
    },

    assignScope: async (id, version, scope) => {
      const keys = Object.keys(scope)
      const result = await collection.updateOne(
        {
          _id: id,
          version,
          ...Object.fromEntries(keys.map((key) => [key, { $exists: false }]))
        },
        { $set: scope, $inc: { version: 1 } }
      )
      if (result.matchedCount === 0) {
        throw Boom.conflict(
          `Summary log ${id} is no longer at version ${version} without ${keys.join(', ')}`
        )
      }
    }
  }
}
