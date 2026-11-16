import { COLLECTION_NAME as PRNS_COLLECTION_NAME } from '#packaging-recycling-notes/repository/mongodb.js'
import { COLLECTION_NAME as SUMMARY_LOGS_COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'
import { REPORTS_COLLECTION } from '#reports/repository/mongodb-collection.js'
import { SUMMARY_LOG_ROW_STATES_COLLECTION_NAME } from '#waste-records/repository/mongodb.js'

/** @import { Collection, Db, Document, Filter } from 'mongodb' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationNumber, OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/**
 * The numbers a record is stored under. `accreditationNumber` is `null` for a
 * registered-only record, and absent for a summary log stored without one.
 *
 * @typedef {{
 *   organisationNumber: OrganisationNumber
 *   registrationNumber: RegistrationNumber
 *   accreditationNumber?: AccreditationNumber | null
 *   year: Year
 * }} Ledger
 */

/**
 * Every collection that stores a summary log id, a PRN id or a ledger's
 * numbers. Derived records come first, so they go before their sources.
 *
 * @typedef {'events' | 'rowStates' | 'reports' | 'prns' | 'summaryLogs'} RecordKind
 */

/** @typedef {Record<RecordKind, number>} RecordCounts */

/**
 * @typedef {{
 *   _id: Omit<Ledger, 'organisationNumber'> & { hasAccreditation: boolean }
 * }} LedgerGroup
 */

/**
 * @typedef {Object} TestOrganisationRecords
 * @property {(organisationNumber: OrganisationNumber) => Promise<Ledger[]>} findLedgers - every ledger the organisation's records are stored under
 * @property {(ledgers: Ledger[]) => Promise<number>} countCitationsOutside - records outside `ledgers` that were derived from a summary log or PRN inside them
 * @property {(kind: RecordKind, ledger: Ledger) => Promise<number>} count
 * @property {(kind: RecordKind, ledger: Ledger) => Promise<number>} remove - counting those removed
 */

const TOP_LEVEL = Object.freeze({
  organisationNumber: 'organisationNumber',
  registrationNumber: 'registrationNumber',
  accreditationNumber: 'accreditationNumber',
  year: 'year'
})

/** @type {Record<RecordKind, { name: string, fields: Record<keyof Ledger, string> }>} */
const COLLECTIONS = {
  events: { name: WASTE_BALANCE_EVENTS_COLLECTION_NAME, fields: TOP_LEVEL },
  rowStates: {
    name: SUMMARY_LOG_ROW_STATES_COLLECTION_NAME,
    fields: TOP_LEVEL
  },
  reports: { name: REPORTS_COLLECTION, fields: TOP_LEVEL },
  prns: {
    name: PRNS_COLLECTION_NAME,
    fields: {
      organisationNumber: 'organisation.organisationNumber',
      registrationNumber: 'registration.registrationNumber',
      accreditationNumber: 'accreditation.accreditationNumber',
      year: 'accreditation.accreditationYear'
    }
  },
  summaryLogs: { name: SUMMARY_LOGS_COLLECTION_NAME, fields: TOP_LEVEL }
}

export const RECORD_KINDS = /** @type {RecordKind[]} */ (
  Object.keys(COLLECTIONS)
)

/** @param {AccreditationNumber | null | undefined} accreditationNumber */
const accreditationFilter = (accreditationNumber) => {
  if (accreditationNumber === undefined) {
    return { $exists: false }
  }
  if (accreditationNumber === null) {
    return { $eq: null, $exists: true }
  }
  return accreditationNumber
}

/**
 * @param {RecordKind} kind
 * @param {Ledger} ledger
 */
const ledgerFilter = (kind, ledger) => {
  const { fields } = COLLECTIONS[kind]
  return {
    [fields.organisationNumber]: ledger.organisationNumber,
    [fields.registrationNumber]: ledger.registrationNumber,
    [fields.accreditationNumber]: accreditationFilter(
      ledger.accreditationNumber
    ),
    [fields.year]: ledger.year
  }
}

/**
 * @param {RecordKind} kind
 * @param {Ledger[]} ledgers
 */
const anyLedger = (kind, ledgers) => ({
  $or: ledgers.map((ledger) => ledgerFilter(kind, ledger))
})

/**
 * The records of a one-off migration, read and removed outside their
 * repositories because no repository removes by ledger.
 *
 * @param {Db} db
 * @returns {TestOrganisationRecords}
 */
export const createTestOrganisationRecords = (db) => {
  /** @param {RecordKind} kind */
  const collection = (kind) =>
    /** @type {Collection<any>} */ (db.collection(COLLECTIONS[kind].name))

  /**
   * @param {RecordKind} kind
   * @param {OrganisationNumber} organisationNumber
   * @returns {Promise<Ledger[]>}
   */
  const ledgersIn = async (kind, organisationNumber) => {
    const { fields } = COLLECTIONS[kind]
    const groups = /** @type {LedgerGroup[]} */ (
      await collection(kind)
        .aggregate([
          { $match: { [fields.organisationNumber]: organisationNumber } },
          {
            $group: {
              _id: {
                registrationNumber: `$${fields.registrationNumber}`,
                accreditationNumber: `$${fields.accreditationNumber}`,
                hasAccreditation: {
                  $ne: [{ $type: `$${fields.accreditationNumber}` }, 'missing']
                },
                year: `$${fields.year}`
              }
            }
          }
        ])
        .toArray()
    )
    return groups.map(({ _id }) => ({
      organisationNumber,
      registrationNumber: _id.registrationNumber,
      ...(_id.hasAccreditation && {
        accreditationNumber: _id.accreditationNumber
      }),
      year: _id.year
    }))
  }

  /**
   * @param {RecordKind} kind
   * @param {Ledger[]} ledgers
   * @param {string} field
   */
  const distinctIn = (kind, ledgers, field) =>
    collection(kind).distinct(field, anyLedger(kind, ledgers))

  /**
   * @param {RecordKind} kind
   * @param {Ledger[]} ledgers
   * @param {Filter<Document>} citing
   */
  const countOutside = (kind, ledgers, citing) =>
    collection(kind).countDocuments({
      $and: [citing, { $nor: anyLedger(kind, ledgers).$or }]
    })

  return {
    findLedgers: async (organisationNumber) => {
      const ledgers = new Map()
      for (const kind of RECORD_KINDS) {
        for (const ledger of await ledgersIn(kind, organisationNumber)) {
          // NOSONAR(javascript:S9382) one collection at a time, to spare the database
          ledgers.set(JSON.stringify(ledger), ledger)
        }
      }
      return [...ledgers.values()]
    },

    countCitationsOutside: async (ledgers) => {
      const fileIds = await distinctIn('summaryLogs', ledgers, 'file.id')
      const prnIds = (await distinctIn('prns', ledgers, '_id')).map((id) =>
        id.toHexString()
      )
      const counts = await Promise.all([
        countOutside('events', ledgers, {
          $or: [
            { 'payload.summaryLogId': { $in: fileIds } },
            { 'payload.prnId': { $in: prnIds } }
          ]
        }),
        countOutside('rowStates', ledgers, {
          summaryLogIds: { $in: fileIds }
        }),
        countOutside('reports', ledgers, {
          $or: [
            { 'source.summaryLogId': { $in: fileIds } },
            { 'stale.summaryLogChanged.summaryLogId': { $in: fileIds } },
            { 'stale.prnCancelled.prnId': { $in: prnIds } },
            {
              'resubmissionRequired.closedPeriodRestated.summaryLogId': {
                $in: fileIds
              }
            }
          ]
        })
      ])
      return counts.reduce((sum, count) => sum + count, 0)
    },

    count: (kind, ledger) =>
      collection(kind).countDocuments(ledgerFilter(kind, ledger)),

    remove: async (kind, ledger) => {
      const { deletedCount } = await collection(kind).deleteMany(
        ledgerFilter(kind, ledger)
      )
      return deletedCount
    }
  }
}
