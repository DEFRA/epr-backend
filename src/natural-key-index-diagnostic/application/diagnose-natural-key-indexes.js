import { COLLECTION_NAME as SUMMARY_LOGS_COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

/** @import { Db } from 'mongodb' */

const REPORTS_COLLECTION_NAME = 'reports'

/**
 * Numbers more than one pair of ids stores reports under. The unique report
 * indexes on the numbers cannot be built while any exist.
 *
 * @typedef {{
 *   organisationNumber?: string,
 *   registrationNumber?: string,
 *   idPairs: Array<{ organisationId: string, registrationId: string }>
 * }} SharedReportNumbers
 */

/**
 * @typedef {{
 *   summaryLogs: number,
 *   submittingSummaryLogsWithoutNumbers: number,
 *   validatedSummaryLogsWithoutNumbers: number,
 *   reports: number,
 *   reportsWithoutNumbers: number,
 *   sharedReportNumbers: SharedReportNumbers[]
 * }} NaturalKeyIndexDiagnosis
 */

const LACKING_A_NUMBER = {
  $or: [
    { organisationNumber: { $exists: false } },
    { registrationNumber: { $exists: false } },
    {
      accreditationId: { $type: 'string' },
      accreditationNumber: { $exists: false }
    }
  ]
}

/**
 * @param {Db} db
 * @param {string} status
 */
const countSummaryLogsWithoutNumbers = (db, status) =>
  db
    .collection(SUMMARY_LOGS_COLLECTION_NAME)
    .countDocuments({ status, ...LACKING_A_NUMBER })

/**
 * @param {Db} db
 * @returns {Promise<SharedReportNumbers[]>}
 */
const findSharedReportNumbers = async (db) => {
  const groups = await db
    .collection(REPORTS_COLLECTION_NAME)
    .aggregate([
      {
        $group: {
          _id: {
            organisationNumber: '$organisationNumber',
            registrationNumber: '$registrationNumber'
          },
          idPairs: {
            $addToSet: {
              organisationId: '$organisationId',
              registrationId: '$registrationId'
            }
          }
        }
      },
      { $match: { 'idPairs.1': { $exists: true } } }
    ])
    .toArray()

  return groups.map(({ _id, idPairs }) => ({ ..._id, idPairs }))
}

/**
 * Reads whether the stored data allows the indexes moving onto the numbers to
 * be built at startup: the submitting lock on summary logs and the unique
 * report indexes. It writes nothing.
 *
 * @param {Db} db
 * @returns {Promise<NaturalKeyIndexDiagnosis>}
 */
export const diagnoseNaturalKeyIndexes = async (db) => {
  const reports = db.collection(REPORTS_COLLECTION_NAME)

  const [
    summaryLogs,
    submittingSummaryLogsWithoutNumbers,
    validatedSummaryLogsWithoutNumbers,
    reportCount,
    reportsWithoutNumbers,
    sharedReportNumbers
  ] = await Promise.all([
    db.collection(SUMMARY_LOGS_COLLECTION_NAME).estimatedDocumentCount(),
    countSummaryLogsWithoutNumbers(db, SUMMARY_LOG_STATUS.SUBMITTING),
    countSummaryLogsWithoutNumbers(db, SUMMARY_LOG_STATUS.VALIDATED),
    reports.estimatedDocumentCount(),
    reports.countDocuments({
      $or: [
        { organisationNumber: { $exists: false } },
        { registrationNumber: { $exists: false } }
      ]
    }),
    findSharedReportNumbers(db)
  ])

  return {
    summaryLogs,
    submittingSummaryLogsWithoutNumbers,
    validatedSummaryLogsWithoutNumbers,
    reports: reportCount,
    reportsWithoutNumbers,
    sharedReportNumbers
  }
}
