/**
 * @import { Collection, Db } from 'mongodb'
 * @import { Report } from './port.js'
 */

const REPORTS_COLLECTION = 'reports'

/**
 * @param {Db} db
 * @returns {Collection<Report>}
 */
export const reportsCollection = (db) =>
  /** @type {Collection<Report>} */ (db.collection(REPORTS_COLLECTION))
