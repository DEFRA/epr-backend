import { COLLECTION_NAME as SUMMARY_LOGS_COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'
import { COLLECTION_NAME as PRNS_COLLECTION_NAME } from '#packaging-recycling-notes/repository/mongodb.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

/** @import { Db } from 'mongodb' */

const REPORTS_COLLECTION_NAME = 'reports'

const REGISTRATION_NUMBER_PATH = '$registrationNumber'

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
 *   submittingLockClashes: number,
 *   reports: number,
 *   reportsWithoutNumbers: number,
 *   sharedReportNumbers: SharedReportNumbers[],
 *   prns: number,
 *   prnsWithoutNumbers: number,
 *   ledgerEvents: number,
 *   ledgerEventsWithoutNumbers: number,
 *   ledgerSlotClashes: number
 * }} NaturalKeyIndexDiagnosis
 */

const PRN_LACKING_A_NUMBER = {
  $or: [
    { 'organisation.organisationNumber': { $not: { $type: 'string' } } },
    { 'registration.registrationNumber': { $not: { $type: 'string' } } },
    { 'accreditation.accreditationNumber': { $not: { $type: 'string' } } }
  ]
}

// A registered-only ledger's accreditation number is null; an accredited one's
// is a string.
const LEDGER_EVENT_LACKING_A_NUMBER = {
  $or: [
    { organisationNumber: { $not: { $type: 'string' } } },
    { registrationNumber: { $not: { $type: 'string' } } },
    {
      accreditationId: { $type: 'string' },
      accreditationNumber: { $not: { $type: 'string' } }
    },
    {
      accreditationId: { $type: 'null' },
      accreditationNumber: { $not: { $type: 'null' } }
    }
  ]
}

// Mirrors holdsNumbers: a registered-only log needs accreditationNumber too.
const LACKING_A_NUMBER = {
  $or: [
    { organisationNumber: { $exists: false } },
    { registrationNumber: { $exists: false } },
    {
      accreditationId: { $exists: true },
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
 * Groups of submitting summary logs that would clash on the unique submitting
 * lock keyed on the numbers.
 *
 * @param {Db} db
 * @returns {Promise<number>}
 */
const countSubmittingLockClashes = async (db) => {
  const clashes = await db
    .collection(SUMMARY_LOGS_COLLECTION_NAME)
    .aggregate([
      { $match: { status: SUMMARY_LOG_STATUS.SUBMITTING } },
      {
        $group: {
          _id: {
            organisationNumber: '$organisationNumber',
            registrationNumber: REGISTRATION_NUMBER_PATH,
            year: '$year',
            accreditationNumber: '$accreditationNumber'
          },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ])
    .toArray()

  return clashes.length
}

/**
 * Groups of ledger events that would clash on the unique slot index keyed on
 * the numbers.
 *
 * @param {Db} db
 * @returns {Promise<number>}
 */
const countLedgerSlotClashes = async (db) => {
  const clashes = await db
    .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
    .aggregate([
      {
        $group: {
          _id: {
            registrationNumber: REGISTRATION_NUMBER_PATH,
            accreditationNumber: '$accreditationNumber',
            number: '$number'
          },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ])
    .toArray()

  return clashes.length
}

/**
 * @param {Db} db
 * @returns {Promise<SharedReportNumbers[]>}
 */
const findSharedReportNumbers = async (db) => {
  const groups = await db
    .collection(REPORTS_COLLECTION_NAME)
    .aggregate([
      // Reports created since they were keyed by number carry no ids.
      { $match: { organisationId: { $exists: true } } },
      {
        $group: {
          _id: {
            organisationNumber: '$organisationNumber',
            registrationNumber: REGISTRATION_NUMBER_PATH
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
 * be built at startup (the submitting lock on summary logs, the unique report
 * indexes and the ledger slot index), and whether every PRN and ledger event would pass a read
 * requiring its numbers. It writes nothing.
 *
 * @param {Db} db
 * @returns {Promise<NaturalKeyIndexDiagnosis>}
 */
export const diagnoseNaturalKeyIndexes = async (db) => {
  const reports = db.collection(REPORTS_COLLECTION_NAME)
  const prnCollection = db.collection(PRNS_COLLECTION_NAME)
  const ledger = db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)

  const [
    summaryLogs,
    submittingSummaryLogsWithoutNumbers,
    validatedSummaryLogsWithoutNumbers,
    submittingLockClashes,
    reportCount,
    reportsWithoutNumbers,
    sharedReportNumbers,
    prns,
    prnsWithoutNumbers,
    ledgerEvents,
    ledgerEventsWithoutNumbers,
    ledgerSlotClashes
  ] = await Promise.all([
    db.collection(SUMMARY_LOGS_COLLECTION_NAME).estimatedDocumentCount(),
    countSummaryLogsWithoutNumbers(db, SUMMARY_LOG_STATUS.SUBMITTING),
    countSummaryLogsWithoutNumbers(db, SUMMARY_LOG_STATUS.VALIDATED),
    countSubmittingLockClashes(db),
    reports.estimatedDocumentCount(),
    reports.countDocuments({
      $or: [
        { organisationNumber: { $exists: false } },
        { registrationNumber: { $exists: false } }
      ]
    }),
    findSharedReportNumbers(db),
    prnCollection.estimatedDocumentCount(),
    prnCollection.countDocuments(PRN_LACKING_A_NUMBER),
    ledger.estimatedDocumentCount(),
    ledger.countDocuments(LEDGER_EVENT_LACKING_A_NUMBER),
    countLedgerSlotClashes(db)
  ])

  return {
    summaryLogs,
    submittingSummaryLogsWithoutNumbers,
    validatedSummaryLogsWithoutNumbers,
    submittingLockClashes,
    reports: reportCount,
    reportsWithoutNumbers,
    sharedReportNumbers,
    prns,
    prnsWithoutNumbers,
    ledgerEvents,
    ledgerEventsWithoutNumbers,
    ledgerSlotClashes
  }
}
