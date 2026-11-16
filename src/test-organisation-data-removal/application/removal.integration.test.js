import { ObjectId } from 'mongodb'
import { beforeEach, describe, expect, vi } from 'vitest'

import { it, DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import { aggregatePrnTonnage } from '#application/prn-tonnage/aggregate-prn-tonnage.js'
import { toYear } from '#common/helpers/dates/year.js'
import {
  MATERIAL,
  REPROCESSING_TYPE,
  TONNAGE_BAND,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createOrganisationReadRepository } from '#organisation-read-model/repository/mongodb.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildPrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

import { createTestOrganisationRecords } from '../mongodb.js'
import { REMOVAL_ACTION, removeTestOrganisationData } from './removal.js'

/** @import { Db } from 'mongodb' */
/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Dependencies } from './removal.js' */

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const COLLECTIONS = [
  'epr-organisations',
  'external-accreditations',
  'summary-logs',
  'packaging-recycling-notes',
  'waste-balance-events',
  'summary-log-row-states',
  'reports',
  'system-logs'
]

// Configured as a test organisation in .vite/setup-files.js
const TEST_ORGANISATION = toOrganisationNumber('999999')
const OPERATOR = toOrganisationNumber('100234')
const YEAR = toYear(2026)

const HELD = {
  organisationNumber: TEST_ORGANISATION,
  registrationNumber: toRegistrationNumber('REG-1'),
  accreditationNumber: toAccreditationNumber('ACC-1'),
  year: YEAR
}
const UNHELD = {
  organisationNumber: TEST_ORGANISATION,
  registrationNumber: toRegistrationNumber('TEST-REG-0123'),
  accreditationNumber: toAccreditationNumber('test-acc-0123'),
  year: YEAR
}
const UNHELD_YEAR = { ...HELD, year: toYear(2027) }
const REGISTERED_ONLY = { ...HELD, accreditationNumber: null }
const UNHELD_REGISTERED_ONLY = { ...UNHELD, accreditationNumber: null }
const OPERATOR_UNHELD = {
  organisationNumber: OPERATOR,
  registrationNumber: toRegistrationNumber('OPERATOR-REG'),
  accreditationNumber: toAccreditationNumber('OPERATOR-ACC'),
  year: YEAR
}

const approved = [
  { status: 'approved', updatedAt: new Date('2026-01-01T00:00:00.000Z') }
]
const contact = { email: 'contact@example.com', fullName: 'A Contact' }

/** The test organisation as epr-organisations stores it, holding REG-1 and ACC-1 for 2026. */
const testOrganisation = {
  _id: new ObjectId(),
  orgId: Number(TEST_ORGANISATION),
  companyDetails: { name: 'Test Reprocessing' },
  statusHistory: approved,
  submittedToRegulator: 'ea',
  submitterContactDetails: contact,
  users: [],
  version: 1,
  accreditations: [
    {
      id: 'acc-1',
      accreditationNumber: HELD.accreditationNumber,
      material: MATERIAL.PLASTIC,
      prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 },
      statusHistory: approved,
      validFrom: '2026-01-01'
    }
  ],
  registrations: [
    {
      id: 'reg-1',
      registrationNumber: HELD.registrationNumber,
      accreditationId: 'acc-1',
      statusHistory: approved,
      validFrom: '2026-01-01',
      material: MATERIAL.PLASTIC,
      submittedToRegulator: 'ea',
      applicationContactDetails: contact,
      submitterContactDetails: contact,
      approvedPersons: [],
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      reprocessingType: REPROCESSING_TYPE.INPUT,
      site: {
        address: {
          line1: '1 Test Street',
          town: 'Testville',
          postcode: 'SW1A 1AA'
        }
      }
    }
  ]
}

/**
 * @typedef {{
 *   organisationNumber: import('#domain/organisations/numbers.js').OrganisationNumber
 *   registrationNumber: import('#domain/organisations/numbers.js').RegistrationNumber
 *   accreditationNumber: import('#domain/organisations/numbers.js').AccreditationNumber | null
 *   year: import('#common/helpers/dates/year.js').Year
 * }} Numbers
 */

/**
 * A summary log submitted under `numbers`, and what its submission derived:
 * a report, a row state and, for an accreditation, a ledger credit.
 *
 * @param {Db} db
 * @param {string} tag
 * @param {Numbers} numbers
 */
const seedSummaryLog = async (db, tag, numbers) => {
  const fileId = toSummaryLogFileId(`${tag}-file`)
  await db.collection('summary-logs').insertOne(
    /** @type {*} */ ({
      _id: `${tag}-log`,
      version: 1,
      status: 'submitted',
      file: { id: fileId, name: `${tag}.xlsx`, status: 'complete' },
      ...numbers
    })
  )
  await db
    .collection('reports')
    .insertOne({ ...numbers, source: { summaryLogId: fileId } })
  await db
    .collection('summary-log-row-states')
    .insertOne({ ...numbers, summaryLogIds: [fileId] })
  if (numbers.accreditationNumber) {
    await db.collection('waste-balance-events').insertOne(
      buildLedgerEvent({
        ...numbers,
        payload: { summaryLogId: fileId, creditTotal: 100 }
      })
    )
  }
}

/**
 * @param {Db} db
 * @param {Numbers & { accreditationNumber: import('#domain/organisations/numbers.js').AccreditationNumber }} numbers
 */
const seedAcceptedPrn = (db, numbers) =>
  db.collection('packaging-recycling-notes').insertOne(
    buildPrn(
      underAccreditation(numbers, {
        tonnage: 40,
        status: {
          currentStatus: PRN_STATUS.ACCEPTED,
          currentStatusAt: new Date('2026-02-01T00:00:00.000Z'),
          history: []
        }
      })
    )
  )

/**
 * @param {Db} db
 * @param {Partial<Numbers>} numbers
 */
const countEverywhere = async (db, numbers) => {
  const topLevel = Object.fromEntries(
    Object.entries(numbers).filter(([, value]) => value !== undefined)
  )
  const prnFilter = {
    'organisation.organisationNumber': numbers.organisationNumber,
    'registration.registrationNumber': numbers.registrationNumber,
    ...(numbers.accreditationNumber && {
      'accreditation.accreditationNumber': numbers.accreditationNumber
    }),
    ...(numbers.year && { 'accreditation.accreditationYear': numbers.year })
  }
  return {
    summaryLogs: await db.collection('summary-logs').countDocuments(topLevel),
    prns:
      numbers.accreditationNumber === null
        ? 0
        : await db
            .collection('packaging-recycling-notes')
            .countDocuments(prnFilter),
    events: await db
      .collection('waste-balance-events')
      .countDocuments(topLevel),
    rowStates: await db
      .collection('summary-log-row-states')
      .countDocuments(topLevel),
    reports: await db.collection('reports').countDocuments(topLevel)
  }
}

const NOTHING = { summaryLogs: 0, prns: 0, events: 0, rowStates: 0, reports: 0 }

describe('removeTestOrganisationData', () => {
  /** @type {Db} */
  let db
  /** @type {TypedLogger} */
  let logger

  const dependencies = async () => ({
    testOrganisationNumbers: [TEST_ORGANISATION],
    records: createTestOrganisationRecords(db),
    organisationReadRepository: createOrganisationReadRepository(db)({
      overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
      logger
    }),
    systemLogsRepository: (await createSystemLogsRepository(db))(logger),
    logger
  })

  /**
   * @param {boolean} isDryRun
   * @param {Partial<Dependencies>} [overrides]
   */
  const run = async (isDryRun, overrides = {}) =>
    removeTestOrganisationData(
      { ...(await dependencies()), ...overrides },
      { isDryRun }
    )

  const reportPrnTonnage = async () =>
    aggregatePrnTonnage(
      (await createPackagingRecyclingNotesRepository(db, []))(logger),
      createOrganisationReadRepository(db)({
        overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
        logger
      }),
      (await createMongoLedgerRepository(db))()
    )

  beforeEach(async (/** @type {*} */ { mongoClient }) => {
    db = mongoClient.db(DATABASE_NAME)
    logger = createMockLogger()
    await Promise.all(
      COLLECTIONS.map((name) => db.collection(name).deleteMany({}))
    )
    await db.collection('epr-organisations').insertOne(testOrganisation)

    await seedSummaryLog(db, 'held', HELD)
    await seedAcceptedPrn(db, HELD)
    await seedSummaryLog(db, 'registered-only', REGISTERED_ONLY)
    await seedSummaryLog(db, 'unheld', UNHELD)
    await seedSummaryLog(db, 'unheld-registered-only', UNHELD_REGISTERED_ONLY)
    await seedAcceptedPrn(db, UNHELD)
    await seedSummaryLog(db, 'unheld-year', UNHELD_YEAR)
    await seedAcceptedPrn(db, UNHELD_YEAR)
    const { accreditationNumber: _, ...noAccreditation } = HELD
    await db.collection('summary-logs').insertOne(
      /** @type {*} */ ({
        _id: 'no-accreditation-log',
        version: 1,
        status: 'submitted',
        file: {
          id: 'no-accreditation-file',
          name: 'x.xlsx',
          status: 'complete'
        },
        ...noAccreditation
      })
    )
    await seedSummaryLog(db, 'operator', OPERATOR_UNHELD)
    await seedAcceptedPrn(db, OPERATOR_UNHELD)
  })

  it('removes every record on a ledger the read model does not hold', async () => {
    await run(false)

    expect(await countEverywhere(db, UNHELD)).toEqual(NOTHING)
    expect(await countEverywhere(db, UNHELD_YEAR)).toEqual(NOTHING)
    expect(await countEverywhere(db, UNHELD_REGISTERED_ONLY)).toEqual(NOTHING)
  })

  it('removes a summary log that names no accreditation', async () => {
    await run(false)

    expect(
      await db
        .collection('summary-logs')
        .countDocuments({ _id: /** @type {*} */ ('no-accreditation-log') })
    ).toBe(0)
  })

  it('keeps the records the read model holds, registered-only ones included', async () => {
    await run(false)

    expect(await countEverywhere(db, HELD)).toEqual({
      summaryLogs: 1,
      prns: 1,
      events: 1,
      rowStates: 1,
      reports: 1
    })
    expect(await countEverywhere(db, REGISTERED_ONLY)).toEqual({
      ...NOTHING,
      summaryLogs: 1,
      rowStates: 1,
      reports: 1
    })
  })

  it('leaves an operator alone, whatever the read model holds', async () => {
    await run(false)

    expect(await countEverywhere(db, OPERATOR_UNHELD)).toEqual({
      summaryLogs: 1,
      prns: 1,
      events: 1,
      rowStates: 1,
      reports: 1
    })
  })

  it("lets the PRN tonnage report place the test organisation's PRNs again", async () => {
    await db
      .collection('packaging-recycling-notes')
      .deleteMany({ 'organisation.organisationNumber': OPERATOR })
    await expect(reportPrnTonnage()).rejects.toThrow(
      'No organisation in the read model holds accreditation'
    )

    await run(false)

    const { rows } = await reportPrnTonnage()
    expect(rows).toEqual([
      expect.objectContaining({
        organisationNumber: TEST_ORGANISATION,
        registrationNumber: HELD.registrationNumber,
        accreditationNumber: HELD.accreditationNumber,
        acceptedTonnage: 40,
        wasteBalance: 100
      })
    ])
  })

  it('audits each ledger it removes, with what it removed', async () => {
    const result = await run(false)

    const audits = await db
      .collection('system-logs')
      .find({ 'event.action': REMOVAL_ACTION })
      .toArray()
    expect(audits.map(({ context }) => context)).toEqual(
      expect.arrayContaining([
        {
          ...UNHELD,
          removed: {
            summaryLogs: 1,
            prns: 1,
            events: 1,
            rowStates: 1,
            reports: 1
          },
          summaryLogIds: ['unheld-log'],
          prnIds: [expect.any(String)]
        },
        {
          ...UNHELD_YEAR,
          removed: {
            summaryLogs: 1,
            prns: 1,
            events: 1,
            rowStates: 1,
            reports: 1
          },
          summaryLogIds: ['unheld-year-log'],
          prnIds: [expect.any(String)]
        },
        {
          ...HELD,
          accreditationNumber: undefined,
          removed: { ...NOTHING, summaryLogs: 1 },
          summaryLogIds: ['no-accreditation-log'],
          prnIds: []
        }
      ])
    )
    expect(audits).toHaveLength(result.removed.length)
    expect(result).toEqual(
      expect.objectContaining({ skipped: 0, failed: 0, auditFailed: 0 })
    )
  })

  it('removes nothing on a dry run, and reports what it would remove', async () => {
    const result = await run(true)

    expect(await countEverywhere(db, UNHELD)).toEqual({
      summaryLogs: 1,
      prns: 1,
      events: 1,
      rowStates: 1,
      reports: 1
    })
    expect(await db.collection('system-logs').countDocuments({})).toBe(0)
    expect(result.removed).toEqual(
      expect.arrayContaining([
        {
          ledger: UNHELD,
          counts: {
            summaryLogs: 1,
            prns: 1,
            events: 1,
            rowStates: 1,
            reports: 1
          },
          sources: {
            summaryLogIds: ['unheld-log'],
            prnIds: [expect.any(String)]
          }
        }
      ])
    )
  })

  it('finds nothing left to remove on a second run', async () => {
    await run(false)

    const result = await run(false)

    expect(result.removed).toEqual([])
  })

  it('skips an organisation when a record it would keep cites one it would remove', async () => {
    await db.collection('waste-balance-events').insertOne(
      buildLedgerEvent({
        ...HELD,
        number: 2,
        payload: {
          summaryLogId: toSummaryLogFileId('unheld-file'),
          creditTotal: 1
        }
      })
    )

    const result = await run(false)

    expect(result).toEqual(expect.objectContaining({ removed: [], skipped: 1 }))
    expect(await countEverywhere(db, UNHELD)).toEqual({
      summaryLogs: 1,
      prns: 1,
      events: 1,
      rowStates: 1,
      reports: 1
    })
    expect(logger.error).toHaveBeenCalledWith({
      message:
        'Skipping test organisation 999999: kept records citing a summary log or PRN it would remove: events=1 rowStates=0 reports=0'
    })
  })

  it.for([
    {
      field: 'stale.summaryLogChanged',
      cite: () => ({
        stale: {
          summaryLogChanged: {
            uploadedAt: '2026-02-01T00:00:00.000Z',
            summaryLogId: 'unheld-file'
          }
        }
      })
    },
    {
      field: 'stale.prnCancelled',
      /** @param {string} prnId */
      cite: (prnId) => ({
        stale: {
          prnCancelled: { occurredAt: '2026-02-01T00:00:00.000Z', prnId }
        }
      })
    },
    {
      field: 'resubmissionRequired.closedPeriodRestated',
      cite: () => ({
        resubmissionRequired: {
          closedPeriodRestated: {
            uploadedAt: '2026-02-01T00:00:00.000Z',
            summaryLogId: 'unheld-file'
          }
        }
      })
    }
  ])(
    'skips an organisation when a kept report cites one it would remove in $field',
    async ({ cite }) => {
      const prn = await db.collection('packaging-recycling-notes').findOne({
        'accreditation.accreditationNumber': UNHELD.accreditationNumber
      })
      await db
        .collection('reports')
        .insertOne({ ...HELD, ...cite(String(prn?._id)) })

      const result = await run(false)

      expect(result).toEqual(
        expect.objectContaining({ removed: [], skipped: 1 })
      )
    }
  )

  it('leaves a yearless ledger under a held accreditation, and removes one under an unheld registration', async () => {
    const { year: _, ...heldYearless } = HELD
    const { year: __, ...unheldYearless } = UNHELD
    for (const numbers of [heldYearless, unheldYearless]) {
      const { year: ___, ...yearlessEvent } = buildLedgerEvent({
        ...numbers,
        number: 9,
        payload: { creditTotal: 1 }
      })
      await db.collection('waste-balance-events').insertOne(yearlessEvent)
      await db
        .collection('summary-log-row-states')
        .insertOne({ ...numbers, summaryLogIds: [] })
    }

    const result = await run(false)

    expect(result.undecided).toBe(1)
    expect(
      await db
        .collection('waste-balance-events')
        .countDocuments({ ...heldYearless, year: { $exists: false } })
    ).toBe(1)
    expect(
      await db
        .collection('summary-log-row-states')
        .countDocuments({ ...heldYearless, year: { $exists: false } })
    ).toBe(1)
    expect(
      await db
        .collection('waste-balance-events')
        .countDocuments({ ...unheldYearless, year: { $exists: false } })
    ).toBe(0)
    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'Leaving test organisation ledger organisationNumber=999999 registrationNumber=REG-1 accreditationNumber=ACC-1 year=undefined: it has no year to judge its accreditation by'
    })
  })

  it('removes everything of a test organisation the read model does not hold at all', async () => {
    const absent = {
      ...UNHELD,
      organisationNumber: toOrganisationNumber('888888'),
      registrationNumber: toRegistrationNumber('ABSENT-REG'),
      accreditationNumber: toAccreditationNumber('ABSENT-ACC')
    }
    await seedSummaryLog(db, 'absent', absent)

    await run(false, {
      testOrganisationNumbers: [TEST_ORGANISATION, absent.organisationNumber]
    })

    expect(await countEverywhere(db, absent)).toEqual(NOTHING)
  })

  it('counts a ledger it fails to remove as failed, for the next run to retry', async () => {
    const records = createTestOrganisationRecords(db)
    const error = new Error('remove failed')

    const result = await run(false, {
      records: { ...records, remove: () => Promise.reject(error) }
    })

    expect(result).toEqual(expect.objectContaining({ removed: [], failed: 4 }))
    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message:
        'Failed to remove test organisation ledger organisationNumber=999999 registrationNumber=REG-1 accreditationNumber=absent year=2026'
    })
  })

  it('counts a ledger it removes but cannot audit', async () => {
    const error = new Error('audit failed')

    const result = await run(false, {
      systemLogsRepository: { insert: () => Promise.reject(error) }
    })

    expect(result).toEqual(
      expect.objectContaining({ failed: 0, auditFailed: 4 })
    )
    expect(await countEverywhere(db, UNHELD)).toEqual(NOTHING)
    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message:
        'Removed but failed to audit test organisation ledger organisationNumber=999999 registrationNumber=TEST-REG-0123 accreditationNumber=test-acc-0123 year=2026'
    })
  })

  it('counts an organisation it cannot read as failed, and removes nothing of it', async () => {
    const error = new Error('read failed')

    const result = await run(false, {
      organisationReadRepository: {
        findByOrganisationNumber: () => Promise.reject(error)
      }
    })

    expect(result).toEqual(expect.objectContaining({ removed: [], failed: 1 }))
    expect(await countEverywhere(db, UNHELD)).not.toEqual(NOTHING)
    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to remove the invalid data of test organisation 999999'
    })
  })
})
