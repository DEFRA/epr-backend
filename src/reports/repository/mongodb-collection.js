/**
 * @import { Collection, Db } from 'mongodb'
 * @import { AccreditationNumber } from '#domain/organisations/numbers.js'
 * @import { Report } from './port.js'
 */

const REPORTS_COLLECTION = 'reports'

/**
 * @param {Db} db
 * @returns {Collection<Report>}
 */
export const reportsCollection = (db) =>
  /** @type {Collection<Report>} */ (db.collection(REPORTS_COLLECTION))

/**
 * The reports as stored, some with the accreditation number that reports no
 * longer carry.
 *
 * @param {Db} db
 * @returns {Collection<Report & { accreditationNumber?: AccreditationNumber | null }>}
 */
export const storedReportsCollection = (db) =>
  /** @type {Collection<Report & { accreditationNumber?: AccreditationNumber | null }>} */ (
    db.collection(REPORTS_COLLECTION)
  )
