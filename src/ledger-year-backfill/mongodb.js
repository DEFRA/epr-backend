import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'
import { SUMMARY_LOG_ROW_STATES_COLLECTION_NAME } from '#waste-records/repository/mongodb.js'

/** @import { Db } from 'mongodb' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RequiredNumbers } from '#domain/organisations/numbers.js' */

/**
 * @typedef {Object} LedgerRecordCounts
 * @property {number} events - ledger events
 * @property {number} rowStates - summary-log row states
 */

/**
 * @typedef {Object} YearlessLedgers
 * @property {() => Promise<RequiredNumbers[]>} findYearless - the ledgers holding a ledger event or row state without a year
 * @property {(numbers: RequiredNumbers, year: Year) => Promise<boolean>} holdsEventsFor - whether the ledger already holds an event for `year`
 * @property {(numbers: RequiredNumbers) => Promise<LedgerRecordCounts>} countYearless
 * @property {(numbers: RequiredNumbers, year: Year) => Promise<LedgerRecordCounts>} assignYear - gives every yearless record of the ledger `year`, counting those it changed
 */

const YEARLESS = { year: { $exists: false } }

/** @param {RequiredNumbers} numbers */
const numbersFilter = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) => ({ organisationNumber, registrationNumber, accreditationNumber })

/**
 * The ledger events and row states as the backfill reads and writes them,
 * outside their repositories because only this one-off migration needs
 * records without a year.
 *
 * @param {Db} db
 * @returns {YearlessLedgers}
 */
export const createYearlessLedgers = (db) => {
  /** @type {import('mongodb').Collection<any>[]} */
  const [events, rowStates] = [
    WASTE_BALANCE_EVENTS_COLLECTION_NAME,
    SUMMARY_LOG_ROW_STATES_COLLECTION_NAME
  ].map((name) => db.collection(name))

  /**
   * @param {(collection: import('mongodb').Collection<any>) => Promise<number>} count
   * @returns {Promise<LedgerRecordCounts>}
   */
  const countEach = async (count) => {
    const [eventCount, rowStateCount] = await Promise.all(
      [events, rowStates].map(count)
    )
    return { events: eventCount, rowStates: rowStateCount }
  }

  return {
    findYearless: async () => {
      const groups = await Promise.all(
        [events, rowStates].map((collection) =>
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
        groups
          .flat()
          .map(({ _id }) => [JSON.stringify(numbersFilter(_id)), _id])
      )
      return [...ledgers.values()]
    },

    holdsEventsFor: async (numbers, year) =>
      (await events.countDocuments(
        { ...numbersFilter(numbers), year },
        { limit: 1 }
      )) > 0,

    countYearless: (numbers) =>
      countEach((collection) =>
        collection.countDocuments({ ...numbersFilter(numbers), ...YEARLESS })
      ),

    assignYear: (numbers, year) =>
      countEach(async (collection) => {
        const { modifiedCount } = await collection.updateMany(
          { ...numbersFilter(numbers), ...YEARLESS },
          { $set: { year } }
        )
        return modifiedCount
      })
  }
}
