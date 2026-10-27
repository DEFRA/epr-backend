import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'

import { backfillLedgerEventNumbers } from './backfill.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const { buildOrganisation } = createOrganisationBuilders()

const organisationId = '6512a0c2f1e4b8a9d0c3e111'
const registrationId = '6512a0c2f1e4b8a9d0c3e222'
const accreditationId = '6512a0c2f1e4b8a9d0c3e333'
const missingOrganisationId = '6512a0c2f1e4b8a9d0c3e999'
const missingRegistrationId = '6512a0c2f1e4b8a9d0c3e777'
const missingAccreditationId = '6512a0c2f1e4b8a9d0c3e888'

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
    })
  ],
  accreditations: [accreditation({ id: accreditationId })]
})

const accredited = { organisationId, registrationId, accreditationId }
const registeredOnly = { organisationId, registrationId, accreditationId: null }

/** @param {{ organisationId: string, registrationId: string, accreditationId: string | null }} ledgerId */
const ledgerKey = ({ organisationId, registrationId, accreditationId }) =>
  `${organisationId}/${registrationId}/${accreditationId}`

/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

describe('backfillLedgerEventNumbers', () => {
  /** @type {*[]} */
  let ledgerStorage
  /** @type {WasteBalanceLedgerRepository} */
  let ledgerRepository
  /** @type {SystemLogsRepository} */
  let systemLogsRepository

  const logger = createMockLogger()

  beforeEach(() => {
    ledgerStorage = []
    ledgerRepository = createInMemoryLedgerRepository(ledgerStorage)()
    systemLogsRepository = createSystemLogsRepository()(logger)
  })

  /** @param {boolean} isDryRun */
  const run = (isDryRun) =>
    backfillLedgerEventNumbers(
      {
        ledgerRepository,
        systemLogsRepository,
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(organisation)
        ])(),
        logger
      },
      { isDryRun }
    )

  /**
   * Events as stored before the numbers were written beside the ids.
   *
   * @param {*} ledgerId
   * @param {number} count
   */
  const storeEvents = (ledgerId, count) => {
    for (let number = 1; number <= count; number++) {
      const {
        organisationNumber: _organisationNumber,
        registrationNumber: _registrationNumber,
        accreditationNumber: _accreditationNumber,
        ...storedWithoutNumbers
      } = buildLedgerEvent({ ...ledgerId, number })
      ledgerStorage.push(storedWithoutNumbers)
    }
  }

  const systemLogs = async () =>
    (await systemLogsRepository.find({ limit: 10 })).systemLogs

  it('adds the numbers to each ledger’s events and audits each ledger as the system user', async () => {
    storeEvents(accredited, 2)

    expect(await run(false)).toEqual({
      missing: 2,
      mapped: 2,
      unmapped: 0,
      unmappedReasons: {},
      failed: 0,
      auditFailed: 0
    })

    expect(await ledgerRepository.findAllInLedger(accredited)).toEqual([
      expect.objectContaining(numbers),
      expect.objectContaining(numbers)
    ])
    expect(await systemLogs()).toEqual([
      expect.objectContaining({
        createdBy: expect.objectContaining({ id: 'system' }),
        event: {
          category: 'waste-reporting',
          subCategory: 'waste-balance',
          action: 'numbers-backfill-migration'
        },
        context: { ...accredited, events: 2, next: numbers }
      })
    ])
  })

  it('gives a registered-only ledger’s events a null accreditation number', async () => {
    storeEvents(registeredOnly, 1)

    await run(false)

    expect(await ledgerRepository.findAllInLedger(registeredOnly)).toEqual([
      expect.objectContaining({ ...numbers, accreditationNumber: null })
    ])
  })

  it('reports what it would add without writing or auditing on a dry run', async () => {
    storeEvents(accredited, 2)

    expect(await run(true)).toMatchObject({ missing: 2, mapped: 2 })

    expect(await ledgerRepository.findAllInLedger(accredited)).toEqual([
      expect.not.objectContaining({ organisationNumber: expect.anything() }),
      expect.not.objectContaining({ organisationNumber: expect.anything() })
    ])
    expect(await systemLogs()).toEqual([])
  })

  it('returns each ledger it cannot map, with its event count, under every reason that applies', async () => {
    const organisationGone = {
      organisationId: missingOrganisationId,
      registrationId,
      accreditationId: null
    }
    const notHeld = {
      organisationId,
      registrationId: missingRegistrationId,
      accreditationId: missingAccreditationId
    }
    storeEvents(organisationGone, 3)
    storeEvents(notHeld, 1)
    storeEvents(accredited, 1)

    expect(await run(false)).toEqual({
      missing: 5,
      mapped: 2,
      unmapped: 4,
      unmappedReasons: {
        'organisation not found': [`${ledgerKey(organisationGone)} (3)`],
        'registration not found': [`${ledgerKey(notHeld)} (1)`],
        'accreditation not found': [`${ledgerKey(notHeld)} (1)`]
      },
      failed: 0,
      auditFailed: 0
    })
  })
})
