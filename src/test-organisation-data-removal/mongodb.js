import { COLLECTION_NAME as PRNS_COLLECTION_NAME } from '#packaging-recycling-notes/repository/mongodb.js'
import { storedOrgId } from '#repositories/organisations/helpers.js'
import { COLLECTION_NAME as ORGANISATIONS_COLLECTION_NAME } from '#repositories/organisations/mongodb-find.js'
import { COLLECTION_NAME as SUMMARY_LOGS_COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'
import { REPORTS_COLLECTION } from '#reports/repository/mongodb-collection.js'
import { SUMMARY_LOG_ROW_STATES_COLLECTION_NAME } from '#waste-records/repository/mongodb.js'

/** @import { Collection, Db, Document, Filter, ObjectId } from 'mongodb' */
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
 * Summary logs stored before numbers were, under the organisation's database
 * id alone.
 *
 * @typedef {{ organisationId: string, summaryLogIds: string[] }} UnnumberedSummaryLogs
 */

/**
 * @typedef {Object} TestOrganisationRecords
 * @property {(organisationNumber: OrganisationNumber) => Promise<Ledger[]>} findLedgers - every ledger the organisation's records are stored under
 * @property {(organisationNumber: OrganisationNumber) => Promise<UnnumberedSummaryLogs | undefined>} findUnnumberedSummaryLogs - undefined when there are none
 * @property {(organisationNumber: OrganisationNumber, unnumberedSummaryLogIds: string[]) => Promise<CitationCounts>} countCitationsOutside - other organisations' records, by kind, that were derived from the organisation's summary logs or PRNs
 * @property {(ledger: Ledger) => Promise<SourceIds>} findSourceIds - the ids of the ledger's summary logs and PRNs
 * @property {(kind: RecordKind, ledger: Ledger) => Promise<number>} count
 * @property {(kind: RecordKind, ledger: Ledger) => Promise<number>} remove - counting those removed
 * @property {(summaryLogIds: string[]) => Promise<number>} removeUnnumberedSummaryLogs - counting those removed
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
 * @param {Filter<{ _id: string | ObjectId }>} filter - a summary log's `_id` is a string, a PRN's an ObjectId
 * @param {string} field
 * @returns {Promise<string[]>}
 */
const distinctIn = async (db, kind, filter, field) =>
  (await collection(db, kind).distinct(field, filter)).map(String)

/** @param {string[]} summaryLogIds */
const unnumberedSummaryLogsIn = (summaryLogIds) => ({
  _id: { $in: summaryLogIds },
  organisationNumber: { $exists: false }
})

/**
 * @param {Db} db
 * @param {OrganisationNumber} organisationNumber
 * @returns {Promise<UnnumberedSummaryLogs | undefined>}
 */
const findUnnumberedSummaryLogs = async (db, organisationNumber) => {
  const organisation = await db
    .collection(ORGANISATIONS_COLLECTION_NAME)
    .findOne(
      { orgId: storedOrgId(organisationNumber) },
      { projection: { _id: 1 } }
    )
  if (!organisation) {
    return undefined
  }
  const organisationId = String(organisation._id)
  const summaryLogIds = await distinctIn(
    db,
    'summaryLogs',
    { organisationId, organisationNumber: { $exists: false } },
    '_id'
  )
  return summaryLogIds.length > 0
    ? { organisationId, summaryLogIds }
    : undefined
}

/**
 * @param {Db} db
 * @param {RecordKind} kind
 * @param {OrganisationNumber} organisationNumber
 * @param {Filter<Document>} citing
 */
const countOutside = (db, kind, organisationNumber, citing) =>
  collection(db, kind).countDocuments({
    $and: [
      citing,
      {
        [COLLECTIONS[kind].fields.organisationNumber]: {
          $ne: organisationNumber
        }
      }
    ]
  })

/**
 * @param {Db} db
 * @param {OrganisationNumber} organisationNumber
 * @param {string[]} unnumberedSummaryLogIds
 * @returns {Promise<CitationCounts>}
 */
const countCitationsOutside = async (
  db,
  organisationNumber,
  unnumberedSummaryLogIds
) => {
  const fileIds = await distinctIn(
    db,
    'summaryLogs',
    {
      $or: [
        { organisationNumber },
        unnumberedSummaryLogsIn(unnumberedSummaryLogIds)
      ]
    },
    'file.id'
  )
  const prnIds = await distinctIn(
    db,
    'prns',
    { [COLLECTIONS.prns.fields.organisationNumber]: organisationNumber },
    '_id'
  )
  const [events, rowStates, reports] = await Promise.all([
    countOutside(db, 'events', organisationNumber, {
      $or: [
        { 'payload.summaryLogId': { $in: fileIds } },
        { 'payload.prnId': { $in: prnIds } }
      ]
    }),
    countOutside(db, 'rowStates', organisationNumber, {
      summaryLogIds: { $in: fileIds }
    }),
    countOutside(db, 'reports', organisationNumber, {
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

  findUnnumberedSummaryLogs: (organisationNumber) =>
    findUnnumberedSummaryLogs(db, organisationNumber),

  countCitationsOutside: (organisationNumber, unnumberedSummaryLogIds) =>
    countCitationsOutside(db, organisationNumber, unnumberedSummaryLogIds),

  findSourceIds: async (ledger) => ({
    summaryLogIds: await distinctIn(
      db,
      'summaryLogs',
      ledgerFilter('summaryLogs', ledger),
      '_id'
    ),
    prnIds: await distinctIn(db, 'prns', ledgerFilter('prns', ledger), '_id')
  }),

  count: (kind, ledger) =>
    collection(db, kind).countDocuments(ledgerFilter(kind, ledger)),

  remove: async (kind, ledger) => {
    const { deletedCount } = await collection(db, kind).deleteMany(
      ledgerFilter(kind, ledger)
    )
    return deletedCount
  },

  removeUnnumberedSummaryLogs: async (summaryLogIds) => {
    const { deletedCount } = await collection(db, 'summaryLogs').deleteMany(
      unnumberedSummaryLogsIn(summaryLogIds)
    )
    return deletedCount
  }
})
