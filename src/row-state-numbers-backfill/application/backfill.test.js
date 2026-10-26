import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import { createMockLogger } from '#test/mock-logger.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { partialMock } from '#test/type-helpers.js'

import { backfillRowStateNumbers } from './backfill.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const { buildOrganisation } = createOrganisationBuilders()

const organisationId = '6512a0c2f1e4b8a9d0c3e111'
const registrationId = '6512a0c2f1e4b8a9d0c3e222'
const accreditationId = '6512a0c2f1e4b8a9d0c3e333'
const unnumberedRegistrationId = '6512a0c2f1e4b8a9d0c3e444'
const missingOrganisationId = '6512a0c2f1e4b8a9d0c3e999'
const missingAccreditationId = '6512a0c2f1e4b8a9d0c3e888'
const unnumberedAccreditationId = '6512a0c2f1e4b8a9d0c3e555'
const missingRegistrationId = '6512a0c2f1e4b8a9d0c3e777'

const numbers = {
  organisationNumber: '500123',
  registrationNumber: 'R25SR500010912PL',
  accreditationNumber: ACCREDITATION_NUMBER
}

const organisation = buildOrganisation({
  id: organisationId,
  orgId: 500123,
  registrations: [
    reprocessor({
      id: registrationId,
      registrationNumber: numbers.registrationNumber,
      accreditationId
    }),
    reprocessor({
      id: unnumberedRegistrationId,
      registrationNumber: null
    })
  ],
  accreditations: [
    accreditation({ id: accreditationId }),
    accreditation({
      id: unnumberedAccreditationId,
      accreditationNumber: null
    })
  ]
})

const accredited = { organisationId, registrationId, accreditationId }
const registeredOnly = { organisationId, registrationId, accreditationId: null }

/** @param {{ organisationId: string, registrationId: string, accreditationId: string | null }} ledgerId */
const ledgerKey = ({ organisationId, registrationId, accreditationId }) =>
  `${organisationId}/${registrationId}/${accreditationId}`

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */

describe('backfillRowStateNumbers', () => {
  /** @type {SummaryLogRowStatesRepository} */
  let summaryLogRowStatesRepository
  /** @type {SystemLogsRepository} */
  let systemLogsRepository
  /** @type {OrganisationsRepository} */
  let organisationsRepository
  /** @type {TypedLogger} */
  let logger

  beforeEach(() => {
    logger = createMockLogger()
    summaryLogRowStatesRepository =
      createInMemorySummaryLogRowStatesRepository()()
    systemLogsRepository = createSystemLogsRepository()(logger)
    organisationsRepository = createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])()
  })

  /** @param {boolean} isDryRun */
  const run = (isDryRun) =>
    backfillRowStateNumbers(
      {
        summaryLogRowStatesRepository,
        systemLogsRepository,
        organisationsRepository,
        logger
      },
      { isDryRun }
    )

  /**
   * Row states as stored before the numbers were written beside the ids.
   *
   * @param {*} ledgerId
   * @param {number} rows
   * @param {string} [summaryLogId]
   */
  const storeRowStates = (ledgerId, rows, summaryLogId = 'log-1') =>
    summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerId,
      Array.from({ length: rows }, (_, i) =>
        buildSummaryLogRowStateEntry({ rowId: `row-${i}` })
      ),
      summaryLogId
    )

  /** @param {*} ledgerId */
  const stored = (ledgerId, summaryLogId = 'log-1') =>
    summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
      ledgerId.organisationId,
      ledgerId.registrationId,
      summaryLogId
    )

  const systemLogs = async () =>
    (await systemLogsRepository.find({ limit: 10 })).systemLogs

  it('adds the numbers to each ledger’s row states and audits each ledger as the system user', async () => {
    await storeRowStates(accredited, 2)

    expect(await run(false)).toEqual({
      missing: 2,
      mapped: 2,
      unmapped: 0,
      unmappedReasons: {},
      failed: 0,
      auditFailed: 0
    })

    expect(await stored(accredited)).toEqual([
      expect.objectContaining(numbers),
      expect.objectContaining(numbers)
    ])
    expect(await systemLogs()).toEqual([
      expect.objectContaining({
        createdBy: expect.objectContaining({ id: 'system' }),
        event: expect.objectContaining({
          action: 'numbers-backfill-migration'
        }),
        context: { ...accredited, rowStates: 2, next: numbers }
      })
    ])
  })

  it('gives a registered-only row state a null accreditation number', async () => {
    await storeRowStates(registeredOnly, 1)

    await run(false)

    expect(await stored(registeredOnly)).toEqual([
      expect.objectContaining({ ...numbers, accreditationNumber: null })
    ])
  })

  it('reports what it would add without writing or auditing on a dry run', async () => {
    await storeRowStates(accredited, 2)

    expect(await run(true)).toEqual({
      missing: 2,
      mapped: 2,
      unmapped: 0,
      unmappedReasons: {},
      failed: 0,
      auditFailed: 0
    })

    expect(await stored(accredited)).toEqual([
      expect.not.objectContaining({ organisationNumber: expect.anything() }),
      expect.not.objectContaining({ organisationNumber: expect.anything() })
    ])
    expect(await systemLogs()).toEqual([])
  })

  describe.each([
    ['a backfill', false],
    ['a dry run', true]
  ])('on %s', (_, isDryRun) => {
    it('returns each ledger it cannot map, with its row state count, under every reason that applies', async () => {
      const organisationGone = {
        organisationId: missingOrganisationId,
        registrationId,
        accreditationId: null
      }
      const unnumbered = {
        organisationId,
        registrationId: unnumberedRegistrationId,
        accreditationId: unnumberedAccreditationId
      }
      const notHeld = {
        organisationId,
        registrationId: missingRegistrationId,
        accreditationId: missingAccreditationId
      }
      await storeRowStates(organisationGone, 3)
      await storeRowStates(unnumbered, 2)
      await storeRowStates(notHeld, 1)
      await storeRowStates(accredited, 1)

      expect(await run(isDryRun)).toEqual({
        missing: 7,
        mapped: 4,
        unmapped: 6,
        unmappedReasons: {
          'organisation not found': [`${ledgerKey(organisationGone)} (3)`],
          'no registration number': [`${ledgerKey(unnumbered)} (2)`],
          'no accreditation number': [`${ledgerKey(unnumbered)} (2)`],
          'registration not found': [`${ledgerKey(notHeld)} (1)`],
          'accreditation not found': [`${ledgerKey(notHeld)} (1)`]
        },
        failed: 0,
        auditFailed: 0
      })
    })

    it('counts as mapped only the row states lacking a number it can find', async () => {
      const unnumbered = {
        organisationId,
        registrationId: unnumberedRegistrationId,
        accreditationId: null
      }
      await storeRowStates(unnumbered, 1)
      await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
        {
          ...unnumbered,
          organisationNumber: toOrganisationNumber(numbers.organisationNumber),
          accreditationNumber: null
        },
        [buildSummaryLogRowStateEntry({ rowId: 'row-written-since' })],
        'log-2'
      )

      expect(await run(isDryRun)).toEqual({
        missing: 2,
        mapped: 1,
        unmapped: 2,
        unmappedReasons: {
          'no registration number': [`${ledgerKey(unnumbered)} (2)`]
        },
        failed: 0,
        auditFailed: 0
      })
    })
  })

  it('still adds the numbers it can find to row states it cannot fully map', async () => {
    const unnumbered = {
      organisationId,
      registrationId: unnumberedRegistrationId,
      accreditationId: null
    }
    await storeRowStates(unnumbered, 1)

    await run(false)

    const [rowState] = await stored(unnumbered)
    expect(rowState).toMatchObject({
      organisationNumber: numbers.organisationNumber,
      accreditationNumber: null
    })
    expect(rowState).not.toHaveProperty('registrationNumber')
  })

  it('neither counts nor audits again a ledger whose remaining numbers it cannot find', async () => {
    const unnumbered = {
      organisationId,
      registrationId: unnumberedRegistrationId,
      accreditationId: null
    }
    await storeRowStates(unnumbered, 2)
    await run(false)

    expect(await run(false)).toEqual({
      missing: 2,
      mapped: 0,
      unmapped: 2,
      unmappedReasons: {
        'no registration number': [`${ledgerKey(unnumbered)} (2)`]
      },
      failed: 0,
      auditFailed: 0
    })
    expect(await systemLogs()).toHaveLength(1)
  })

  it('leaves only the unmapped ledgers for the next run', async () => {
    const organisationGone = {
      organisationId: missingOrganisationId,
      registrationId,
      accreditationId: null
    }
    await storeRowStates(accredited, 1)
    await storeRowStates(organisationGone, 1)
    await run(false)

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 0,
      unmapped: 1,
      unmappedReasons: {
        'organisation not found': [`${ledgerKey(organisationGone)} (1)`]
      },
      failed: 0,
      auditFailed: 0
    })
    expect(await systemLogs()).toHaveLength(1)
  })

  it('counts a failed organisation lookup as a failure, not as unmapped, and carries on', async () => {
    const failing = {
      organisationId: missingOrganisationId,
      registrationId,
      accreditationId: null
    }
    await storeRowStates(failing, 1)
    await storeRowStates(accredited, 1)
    const outage = new Error('connection lost')
    const findById = organisationsRepository.findById
    organisationsRepository.findById = (id) =>
      id === missingOrganisationId ? Promise.reject(outage) : findById(id)

    expect(await run(false)).toEqual({
      missing: 2,
      mapped: 1,
      unmapped: 0,
      unmappedReasons: {},
      failed: 1,
      auditFailed: 0
    })
    expect(logger.error).toHaveBeenCalledWith({
      err: outage,
      message: `Failed to backfill numbers for row states of ledger ${ledgerKey(failing)}`
    })
    expect(await stored(accredited)).toEqual([expect.objectContaining(numbers)])
  })

  it('counts written but unaudited row states apart from failures', async () => {
    await storeRowStates(accredited, 1)
    const auditError = new Error('system logs down')
    systemLogsRepository.insert = () => Promise.reject(auditError)

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 1,
      unmapped: 0,
      unmappedReasons: {},
      failed: 0,
      auditFailed: 1
    })
    expect(await stored(accredited)).toEqual([expect.objectContaining(numbers)])
    expect(logger.error).toHaveBeenCalledWith({
      err: auditError,
      message: `Numbers written but audit failed for 1 row states of ledger ${ledgerKey(accredited)}: ${JSON.stringify(numbers)}`
    })
  })
})
