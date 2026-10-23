import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { buildDraftPrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { reprocessor } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'

import { backfillPrnNumbers } from './backfill.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const { buildOrganisation } = createOrganisationBuilders()

const organisationId = '6512a0c2f1e4b8a9d0c3e111'
const registrationId = '6512a0c2f1e4b8a9d0c3e222'
const unnumberedRegistrationId = '6512a0c2f1e4b8a9d0c3e444'
const missingOrganisationId = '6512a0c2f1e4b8a9d0c3e999'
const missingRegistrationId = '6512a0c2f1e4b8a9d0c3e888'

const numbers = {
  organisationNumber: '500123',
  registrationNumber: 'R25SR500010912PL'
}

const organisation = buildOrganisation({
  id: organisationId,
  orgId: 500123,
  registrations: [
    reprocessor({
      id: registrationId,
      registrationNumber: numbers.registrationNumber
    }),
    reprocessor({
      id: unnumberedRegistrationId,
      registrationNumber: null
    })
  ]
})

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

describe('backfillPrnNumbers', () => {
  /** @type {PackagingRecyclingNotesRepository} */
  let prnRepository
  /** @type {SystemLogsRepository} */
  let systemLogsRepository
  /** @type {OrganisationsRepository} */
  let organisationsRepository
  /** @type {TypedLogger} */
  let logger

  beforeEach(() => {
    logger = createMockLogger()
    prnRepository = createInMemoryPackagingRecyclingNotesRepository()(logger)
    systemLogsRepository = createSystemLogsRepository()(logger)
    organisationsRepository = createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])()
  })

  /** @param {boolean} isDryRun */
  const run = (isDryRun) =>
    backfillPrnNumbers(
      { prnRepository, systemLogsRepository, organisationsRepository, logger },
      { isDryRun }
    )

  /**
   * A PRN stored before the numbers were written beside the ids.
   *
   * @param {{ organisationId?: string, registrationId?: string, organisationNumber?: string }} [overrides]
   */
  const createPrn = async (overrides = {}) => {
    const draft = buildDraftPrn()
    const prn = await prnRepository.create({
      ...draft,
      organisation: {
        ...draft.organisation,
        id: overrides.organisationId ?? organisationId,
        ...(overrides.organisationNumber && {
          organisationNumber: toOrganisationNumber(overrides.organisationNumber)
        })
      },
      registrationId: overrides.registrationId ?? registrationId
    })
    return prn.id
  }

  /** @param {string} id */
  const stored = async (id) => {
    const prn = await prnRepository.findById(id)
    return {
      organisationNumber: prn.organisation.organisationNumber,
      registrationNumber: prn.registrationNumber
    }
  }

  const systemLogs = async () =>
    (await systemLogsRepository.find({ limit: 10 })).systemLogs

  it('adds the numbers each PRN lacks and audits each as the system user', async () => {
    const unnumbered = await createPrn()
    const partlyNumbered = await createPrn({
      organisationNumber: numbers.organisationNumber
    })

    expect(await run(false)).toEqual({
      missing: 2,
      mapped: 2,
      unmapped: 0,
      unmappedReasons: {},
      failed: 0,
      auditFailed: 0
    })

    expect(await stored(unnumbered)).toEqual(numbers)
    expect(await stored(partlyNumbered)).toEqual(numbers)
    const logs = await systemLogs()
    expect(logs).toHaveLength(2)
    expect(logs).toContainEqual(
      expect.objectContaining({
        createdBy: expect.objectContaining({ id: 'system' }),
        event: {
          category: 'waste-reporting',
          subCategory: 'packaging-recycling-notes',
          action: 'numbers-backfill-migration'
        },
        context: {
          prnId: partlyNumbered,
          organisationId,
          registrationId,
          next: { registrationNumber: numbers.registrationNumber }
        }
      })
    )
  })

  it('leaves the version alone', async () => {
    const id = await createPrn()
    const { version } = await prnRepository.findById(id)

    await run(false)

    expect((await prnRepository.findById(id)).version).toBe(version)
  })

  it('reports what it would add without writing or auditing on a dry run', async () => {
    const id = await createPrn()

    expect(await run(true)).toEqual({
      missing: 1,
      mapped: 1,
      unmapped: 0,
      unmappedReasons: {},
      failed: 0,
      auditFailed: 0
    })

    expect(await stored(id)).toEqual({
      organisationNumber: undefined,
      registrationNumber: undefined
    })
    expect(await systemLogs()).toEqual([])
  })

  describe.each([
    ['a backfill', false],
    ['a dry run', true]
  ])('on %s', (_, isDryRun) => {
    it('returns each PRN it cannot map under every reason that applies, logging none of them', async () => {
      const organisationGone = await createPrn({
        organisationId: missingOrganisationId
      })
      const unnumbered = await createPrn({
        registrationId: unnumberedRegistrationId
      })
      const registrationGone = await createPrn({
        registrationId: missingRegistrationId
      })

      expect(await run(isDryRun)).toEqual({
        missing: 3,
        mapped: 2,
        unmapped: 3,
        unmappedReasons: {
          'organisation not found': [organisationGone],
          'no registration number': [unnumbered, registrationGone]
        },
        failed: 0,
        auditFailed: 0
      })
      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  it('reports an organisation without an organisation number', async () => {
    organisationsRepository.findById = async () =>
      partialMock({ ...organisation, orgId: 0 })
    const id = await createPrn()

    expect((await run(false)).unmappedReasons).toEqual({
      'no organisation number': [id]
    })
    expect(await stored(id)).toEqual({
      organisationNumber: undefined,
      registrationNumber: numbers.registrationNumber
    })
  })

  it('does not report a number the PRN already holds as unmapped', async () => {
    organisationsRepository.findById = async () =>
      partialMock({ ...organisation, orgId: 0 })
    const id = await createPrn({
      organisationNumber: numbers.organisationNumber
    })

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 1,
      unmapped: 0,
      unmappedReasons: {},
      failed: 0,
      auditFailed: 0
    })
    expect(await stored(id)).toEqual(numbers)
  })

  it('leaves only the unmapped PRNs for the next run', async () => {
    await createPrn()
    const organisationGone = await createPrn({
      organisationId: missingOrganisationId
    })
    await run(false)

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 0,
      unmapped: 1,
      unmappedReasons: { 'organisation not found': [organisationGone] },
      failed: 0,
      auditFailed: 0
    })
    expect(await systemLogs()).toHaveLength(1)
  })

  it('skips a PRN that has gone since it was listed', async () => {
    prnRepository.findIdsWithoutNumbers = async () => [
      new ObjectId().toHexString()
    ]

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 0,
      unmapped: 0,
      unmappedReasons: {},
      failed: 0,
      auditFailed: 0
    })
  })

  it('counts a failed organisation lookup as a failure, not as unmapped, and carries on', async () => {
    const failing = await createPrn({ organisationId: missingOrganisationId })
    const written = await createPrn()
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
      message: `Failed to backfill numbers for PRN ${failing}`
    })
    expect(await stored(written)).toEqual(numbers)
  })

  it('counts a written but unaudited PRN apart from failures', async () => {
    const id = await createPrn()
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
    expect(await stored(id)).toEqual(numbers)
    expect(logger.error).toHaveBeenCalledWith({
      err: auditError,
      message: `Numbers written but audit failed for PRN ${id}: ${JSON.stringify(numbers)}`
    })
  })
})
