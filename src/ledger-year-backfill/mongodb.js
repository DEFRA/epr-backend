import { ObjectId } from 'mongodb'

import { COLLECTION_NAME as PRNS_COLLECTION_NAME } from '#packaging-recycling-notes/repository/mongodb.js'
import { COLLECTION_NAME as SUMMARY_LOGS_COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'
import { SUMMARY_LOG_ROW_STATES_COLLECTION_NAME } from '#waste-records/repository/mongodb.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RequiredNumbers } from '#domain/organisations/numbers.js' */

/**
 * @typedef {Object} LedgerRecordCounts
 * @property {number} events - ledger events
 * @property {number} rowStates - summary-log row states
 */

/**
 * A ledger event stored without a year, with the source that gives its year:
 * the summary log it records, by file id, or the PRN it records.
 *
 * @typedef {{ id: ObjectId } & (
 *   | { summaryLogId: string, prnId?: undefined }
 *   | { prnId: string, summaryLogId?: undefined }
 * )} YearlessEvent
 */

/**
 * A row state stored without a year, with the file ids of the summary logs
 * that hold it.
 *
 * @typedef {{ id: ObjectId, summaryLogIds: string[] }} YearlessRowState
 */

/**
 * @typedef {Object} YearlessLedgers
 * @property {() => Promise<RequiredNumbers[]>} findYearless - the ledgers holding a ledger event or row state without a year
 * @property {(numbers: RequiredNumbers) => Promise<{ events: YearlessEvent[], rowStates: YearlessRowState[] }>} readYearless - the ledger's records without a year
 * @property {(fileIds: string[]) => Promise<Map<string, Year | undefined>>} yearsOfSummaryLogs - by file id, the year of each summary log found, `undefined` for one stored without a year
 * @property {(prnIds: string[]) => Promise<Map<string, Year>>} accreditationYearsOfPrns - by id, the accreditation year of each PRN found
 * @property {(ids: LedgerRecordIds, year: Year) => Promise<LedgerRecordCounts>} assignYear - gives each of the records still without a year `year`, counting those it changed
 */

/**
 * @typedef {Object} LedgerRecordIds
 * @property {ObjectId[]} events
 * @property {ObjectId[]} rowStates
 */

const YEARLESS = { year: { $exists: false } }

/** @param {RequiredNumbers} numbers */
const numbersFilter = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) => ({ organisationNumber, registrationNumber, accreditationNumber })

/**
 * @param {Collection<any>[]} collections
 * @returns {Promise<RequiredNumbers[]>}
 */
const findYearless = async (collections) => {
  const groups = await Promise.all(
    collections.map((collection) =>
      collection
        .aggregate([
          { $match: YEARLESS },
          {
            $group: {
              _id: {
                organisationNumber: '$organisationNumber',
                registrationNumber: '$registrationNumber',
                accreditationNumber: '$accreditationNumber'
              }
            }
          }
        ])
        .toArray()
    )
  )
  const ledgers = new Map(
    groups.flat().map(({ _id }) => [JSON.stringify(numbersFilter(_id)), _id])
  )
  return [...ledgers.values()]
}

/**
 * @param {Collection<any>} events
 * @param {Collection<any>} rowStates
 * @param {RequiredNumbers} numbers
 * @returns {Promise<{ events: YearlessEvent[], rowStates: YearlessRowState[] }>}
 */
const readYearless = async (events, rowStates, numbers) => {
  const filter = { ...numbersFilter(numbers), ...YEARLESS }
  const [eventDocs, rowStateDocs] = await Promise.all([
    events
      .find(filter, {
        projection: { 'payload.summaryLogId': 1, 'payload.prnId': 1 }
      })
      .toArray(),
    rowStates.find(filter, { projection: { summaryLogIds: 1 } }).toArray()
  ])
  return {
    events: eventDocs.map(({ _id, payload }) => ({
      id: _id,
      ...(payload.prnId
        ? { prnId: payload.prnId }
        : { summaryLogId: payload.summaryLogId })
    })),
    rowStates: rowStateDocs.map(({ _id, summaryLogIds }) => ({
      id: _id,
      summaryLogIds
    }))
  }
}

/**
 * The records the backfill gives a year, and the summary logs and PRNs it
 * reads their years from, outside their repositories because only this
 * one-off migration needs records without a year.
 *
 * @param {Db} db
 * @returns {YearlessLedgers}
 */
export const createYearlessLedgers = (db) => {
  /** @type {Collection<any>[]} */
  const [events, rowStates, summaryLogs, prns] = [
    WASTE_BALANCE_EVENTS_COLLECTION_NAME,
    SUMMARY_LOG_ROW_STATES_COLLECTION_NAME,
    SUMMARY_LOGS_COLLECTION_NAME,
    PRNS_COLLECTION_NAME
  ].map((name) => db.collection(name))

  return {
    findYearless: () => findYearless([events, rowStates]),

    readYearless: (numbers) => readYearless(events, rowStates, numbers),

    yearsOfSummaryLogs: async (fileIds) => {
      const docs = await summaryLogs
        .find(
          { 'file.id': { $in: fileIds } },
          { projection: { 'file.id': 1, year: 1 } }
        )
        .toArray()
      return new Map(docs.map(({ file, year }) => [file.id, year]))
    },

    accreditationYearsOfPrns: async (prnIds) => {
      const docs = await prns
        .find(
          {
            _id: { $in: prnIds.map((id) => ObjectId.createFromHexString(id)) }
          },
          { projection: { 'accreditation.accreditationYear': 1 } }
        )
        .toArray()
      return new Map(
        docs.map(({ _id, accreditation }) => [
          _id.toHexString(),
          accreditation.accreditationYear
        ])
      )
    },

    assignYear: async (ids, year) => {
      const [eventResult, rowStateResult] = await Promise.all([
        events.updateMany(
          { _id: { $in: ids.events }, ...YEARLESS },
          { $set: { year } }
        ),
        rowStates.updateMany(
          { _id: { $in: ids.rowStates }, ...YEARLESS },
          { $set: { year } }
        )
      ])
      return {
        events: eventResult.modifiedCount,
        rowStates: rowStateResult.modifiedCount
      }
    }
  }
}
