import { describe, expect, it } from 'vitest'
import { PRN_STATUS } from '../domain/model.js'
import { getIssuedTonnage } from './get-issued-tonnage.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '../repository/inmemory.plugin.js'
import { buildPrn } from '../repository/contract/test-data.js'
import { createMockLogger } from '#test/mock-logger.js'

const PERIOD_START = '2025-01-01'
const PERIOD_END = '2025-12-31'
const IN_PERIOD = new Date('2025-06-15T12:00:00Z')
const ACTOR = { id: 'u', name: 'U' }

const ACCREDITATION_ID = 'acc-123'

const defaultParams = {
  accreditationId: ACCREDITATION_ID,
  startDate: PERIOD_START,
  endDate: PERIOD_END
}

function createRepo() {
  return createInMemoryPackagingRecyclingNotesRepository()(createMockLogger())
}

/**
 * Creates a draft PRN then transitions it to awaiting_acceptance,
 * populating the issued slot at the given timestamp.
 *
 * @param {object} repo
 * @param {{ tonnage: number, issuedAt?: Date }} options
 */
async function issuePrn(repo, { tonnage, issuedAt = IN_PERIOD }) {
  const draft = await repo.create(
    buildPrn({
      tonnage,
      accreditation: {
        id: ACCREDITATION_ID,
        accreditationNumber: 'ACC-001',
        accreditationYear: 2026,
        material: 'plastic',
        submittedToRegulator: 'ea',
        siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
      }
    })
  )

  return repo.updateStatus({
    id: draft.id,
    version: draft.version,
    status: PRN_STATUS.AWAITING_ACCEPTANCE,
    updatedAt: issuedAt,
    updatedBy: ACTOR,
    operation: { slot: 'issued', at: issuedAt, by: ACTOR }
  })
}

/**
 * Transitions an issued PRN to accepted, populating the accepted slot.
 *
 * @param {object} repo
 * @param {string} id
 * @param {{ acceptedAt?: Date }} options
 */
async function acceptPrn(repo, id, { acceptedAt = IN_PERIOD } = {}) {
  const current = await repo.findById(id)
  return repo.updateStatus({
    id,
    version: current.version,
    status: PRN_STATUS.ACCEPTED,
    updatedAt: acceptedAt,
    updatedBy: ACTOR,
    operation: { slot: 'accepted', at: acceptedAt, by: ACTOR }
  })
}

/**
 * Transitions an issued PRN to awaiting_cancellation.
 *
 * @param {object} repo
 * @param {string} id
 */
async function requestCancelPrn(repo, id) {
  const current = await repo.findById(id)
  return repo.updateStatus({
    id,
    version: current.version,
    status: PRN_STATUS.AWAITING_CANCELLATION,
    updatedAt: IN_PERIOD,
    updatedBy: ACTOR
  })
}

/**
 * Transitions a PRN awaiting cancellation to cancelled, populating the
 * cancelled slot.
 *
 * @param {object} repo
 * @param {string} id
 */
async function cancelPrn(repo, id) {
  const current = await repo.findById(id)
  return repo.updateStatus({
    id,
    version: current.version,
    status: PRN_STATUS.CANCELLED,
    updatedAt: IN_PERIOD,
    updatedBy: ACTOR,
    operation: { slot: 'cancelled', at: IN_PERIOD, by: ACTOR }
  })
}

describe('getIssuedTonnage', () => {
  it('returns null when accreditationId is absent', async () => {
    const result = await getIssuedTonnage(createRepo(), {
      ...defaultParams,
      accreditationId: undefined
    })

    expect(result).toBeNull()
  })

  it('returns null when accreditationId is null', async () => {
    const result = await getIssuedTonnage(createRepo(), {
      ...defaultParams,
      accreditationId: null
    })

    expect(result).toBeNull()
  })

  it('returns issuedTonnage for qualifying PRNs', async () => {
    const repo = createRepo()
    await issuePrn(repo, { tonnage: 30 })
    const issued = await issuePrn(repo, { tonnage: 20 })
    await acceptPrn(repo, issued.id)

    const result = await getIssuedTonnage(repo, defaultParams)

    expect(result).toEqual({ issuedTonnage: 50 })
  })

  it('returns issuedTonnage of 0 when no PRNs found', async () => {
    const result = await getIssuedTonnage(createRepo(), defaultParams)

    expect(result).toEqual({ issuedTonnage: 0 })
  })

  it('excludes PRN with no qualifying slot timestamps in period', async () => {
    const repo = createRepo()
    await repo.create(
      buildPrn({
        tonnage: 100,
        accreditation: {
          id: ACCREDITATION_ID,
          accreditationNumber: 'ACC-001',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea',
          siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
        }
      })
    )

    const result = await getIssuedTonnage(repo, defaultParams)

    expect(result).toEqual({ issuedTonnage: 0 })
  })

  it('includes a PRN with issued.at exactly at end of day on endDate', async () => {
    const atEndOfDay = new Date('2025-12-31T23:59:59.999Z')
    const repo = createRepo()
    await issuePrn(repo, { tonnage: 10, issuedAt: atEndOfDay })

    const result = await getIssuedTonnage(repo, defaultParams)

    expect(result).toEqual({ issuedTonnage: 10 })
  })

  it('includes accepted PRN whose accepted.at falls after endDate but issued.at is in period', async () => {
    const afterPeriod = new Date('2026-02-01T00:00:00Z')
    const repo = createRepo()
    const issued = await issuePrn(repo, { tonnage: 40 })
    await acceptPrn(repo, issued.id, { acceptedAt: afterPeriod })

    const result = await getIssuedTonnage(repo, defaultParams)

    expect(result).toEqual({ issuedTonnage: 40 })
  })

  it('excludes cancelled and awaiting-cancellation PRNs, but keeps accepted and in-flight ones, all issued within the period', async () => {
    const repo = createRepo()
    await issuePrn(repo, { tonnage: 30 })
    const accepted = await issuePrn(repo, { tonnage: 20 })
    await acceptPrn(repo, accepted.id)
    const awaitingCancellation = await issuePrn(repo, { tonnage: 75 })
    await requestCancelPrn(repo, awaitingCancellation.id)
    const cancelled = await issuePrn(repo, { tonnage: 75 })
    await requestCancelPrn(repo, cancelled.id)
    await cancelPrn(repo, cancelled.id)

    const result = await getIssuedTonnage(repo, defaultParams)

    expect(result).toEqual({ issuedTonnage: 50 })
  })
})
