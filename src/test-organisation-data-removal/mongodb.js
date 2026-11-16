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
 * `year` is absent for a record the ledger year backfill could not place.
 *
 * @typedef {{
 *   organisationNumber: OrganisationNumber
 *   registrationNumber: RegistrationNumber
 *   accreditationNumber?: AccreditationNumber | null
 *   year?: Year
 * }} Ledger
 */

/**
 * The collections whose records are stored under a ledger's numbers or derived
 * from a summary log or PRN. Derived records come first, so they go before
 * their sources. System logs, the organisations and external accreditations
 * are kept.
 *
 * @typedef {'events' | 'rowStates' | 'reports' | 'prns' | 'summaryLogs'} RecordKind
 */

/** @typedef {Record<RecordKind, number>} RecordCounts */

/**
 * @typedef {{
 *   _id: Omit<Ledger, 'organisationNumber'> & { hasAccreditation: boolean }
 * }} LedgerGroup
 */

/** @typedef {Record<'events' | 'rowStates' | 'reports', number>} CitationCounts */

/** @typedef {{ summaryLogIds: string[], prnIds: string[] }} SourceIds */

/**
 * @typedef {Object} TestOrganisationRecords
 * @property {(organisationNumber: OrganisationNumber) => Promise<Ledger[]>} findLedgers - every ledger the organisation's records are stored under
 * @property {(ledgers: Ledger[]) => Promise<CitationCounts>} countCitationsOutside - records outside `ledgers`, by kind, that were derived from a summary log or PRN inside them
 * @property {(ledger: Ledger) => Promise<SourceIds>} findSourceIds - the ids of the ledger's summary logs and PRNs
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
  return { $eq: accreditationNumber }
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
 * @param {Db} db
 * @param {RecordKind} kind
 */
const collection = (db, kind) =>
  /** @type {Collection<any>} */ (db.collection(COLLECTIONS[kind].name))

/**
 * @param {Db} db
 * @param {RecordKind} kind
 * @param {OrganisationNumber} organisationNumber
 * @returns {Promise<Ledger[]>}
 */
const ledgersIn = async (db, kind, organisationNumber) => {
  const { fields } = COLLECTIONS[kind]
  const groups = /** @type {LedgerGroup[]} */ (
    await collection(db, kind)
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
 * @param {Db} db
 * @param {RecordKind} kind
 * @param {Ledger[]} ledgers
 * @param {string} field
 * @returns {Promise<string[]>}
 */
const distinctIn = async (db, kind, ledgers, field) =>
  (await collection(db, kind).distinct(field, anyLedger(kind, ledgers))).map(
    String
  )

/**
 * @param {Db} db
 * @param {RecordKind} kind
 * @param {Ledger[]} ledgers
 * @param {Filter<Document>} citing
 */
const countOutside = (db, kind, ledgers, citing) =>
  collection(db, kind).countDocuments({
    $and: [citing, { $nor: anyLedger(kind, ledgers).$or }]
  })

/**
 * @param {Db} db
 * @param {Ledger[]} ledgers
 * @returns {Promise<CitationCounts>}
 */
const countCitationsOutside = async (db, ledgers) => {
  const fileIds = await distinctIn(db, 'summaryLogs', ledgers, 'file.id')
  const prnIds = await distinctIn(db, 'prns', ledgers, '_id')
  const [events, rowStates, reports] = await Promise.all([
    countOutside(db, 'events', ledgers, {
      $or: [
        { 'payload.summaryLogId': { $in: fileIds } },
        { 'payload.prnId': { $in: prnIds } }
      ]
    }),
    countOutside(db, 'rowStates', ledgers, {
      summaryLogIds: { $in: fileIds }
    }),
    countOutside(db, 'reports', ledgers, {
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
  return { events, rowStates, reports }
}

/**
 * The records of a one-off migration, read and removed outside their
 * repositories because no repository removes by ledger.
 *
 * @param {Db} db
 * @returns {TestOrganisationRecords}
 */
export const createTestOrganisationRecords = (db) => ({
  findLedgers: async (organisationNumber) => {
    const ledgers = new Map()
    for (const kind of RECORD_KINDS) {
      const found = await ledgersIn(db, kind, organisationNumber) // NOSONAR(javascript:S9382) one collection at a time, to spare the database
      for (const ledger of found) {
        ledgers.set(JSON.stringify(ledger), ledger)
      }
    }
    return [...ledgers.values()]
  },

  countCitationsOutside: (ledgers) => countCitationsOutside(db, ledgers),

  findSourceIds: async (ledger) => ({
    summaryLogIds: await distinctIn(db, 'summaryLogs', [ledger], '_id'),
    prnIds: await distinctIn(db, 'prns', [ledger], '_id')
  }),

  count: (kind, ledger) =>
    collection(db, kind).countDocuments(ledgerFilter(kind, ledger)),

  remove: async (kind, ledger) => {
    const { deletedCount } = await collection(db, kind).deleteMany(
      ledgerFilter(kind, ledger)
    )
    return deletedCount
  }
})
