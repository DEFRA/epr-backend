import { describe, it, expect, vi } from 'vitest'

import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { resolveClassificationContext } from './classify-and-persist.js'

const approvedTimeline = [
  { status: 'created', at: '2024-12-01T00:00:00.000Z' },
  { status: 'approved', at: '2025-01-01T00:00:00.000Z' }
]

const registration = {
  wasteProcessingType: 'exporter',
  overseasSites: {
    100: { name: 'Site A', address: { country: 'India', line1: 'x' } }
  }
}

const servedAccreditation = {
  organisation: {},
  registration,
  accreditation: {
    accreditationNumber: 'ACC-1',
    status: { current: 'approved', timeline: approvedTimeline },
    overseasSites: { 100: { status: 'approved', approvedOn: '2025-02-03' } }
  },
  year: '2025'
}

const summaryLogWith = (numbers) =>
  /** @type {any} */ ({
    organisationId: 'org-1',
    registrationId: 'reg-1',
    organisationNumber: '500001',
    registrationNumber: 'REG-1',
    accreditationNumber: 'ACC-1',
    ...numbers
  })

const readRepositoryServing = (found) =>
  /** @type {any} */ ({
    findAccreditationByNumber: vi.fn().mockResolvedValue(found)
  })

describe('resolveClassificationContext', () => {
  it('looks the accreditation up by the summary log’s numbers', async () => {
    const organisationReadRepository =
      readRepositoryServing(servedAccreditation)

    await resolveClassificationContext({
      processingType: 'EXPORTER',
      summaryLog: summaryLogWith({}),
      organisationReadRepository
    })

    expect(
      organisationReadRepository.findAccreditationByNumber
    ).toHaveBeenCalledWith('500001', 'REG-1', 'ACC-1')
  })

  it('classifies an exporter against the read model’s accredited period and approved sites', async () => {
    const context = await resolveClassificationContext({
      processingType: 'EXPORTER',
      summaryLog: summaryLogWith({}),
      organisationReadRepository: readRepositoryServing(servedAccreditation)
    })

    expect(context).toEqual({
      accreditation: {
        window: { validFrom: '2025-01-01', validTo: '2025-12-31' },
        timeline: approvedTimeline
      },
      overseasSites: {
        100: {
          approvedFrom: new Date('2025-02-03T00:00:00.000Z'),
          name: 'Site A',
          country: 'India'
        }
      }
    })
  })

  it('disables the overseas-site checks for a reprocessor', async () => {
    const context = await resolveClassificationContext({
      processingType: 'REPROCESSOR_INPUT',
      summaryLog: summaryLogWith({}),
      organisationReadRepository: readRepositoryServing(servedAccreditation)
    })

    expect(context.accreditation?.window).toEqual({
      validFrom: '2025-01-01',
      validTo: '2025-12-31'
    })
    expect(context.overseasSites).toBe(ORS_VALIDATION_DISABLED)
  })

  // Ruling 20: an accreditation the read model drops is never accredited, so
  // its rows are outside the accreditation period rather than, as a null
  // accreditation would make them, accredited at every date.
  it.each([
    ['EXPORTER', {}],
    ['REPROCESSOR_INPUT', ORS_VALIDATION_DISABLED]
  ])(
    'classifies a %s summary log whose accreditation the read model does not serve as never accredited',
    async (processingType, overseasSites) => {
      const context = await resolveClassificationContext({
        processingType,
        summaryLog: summaryLogWith({}),
        organisationReadRepository: readRepositoryServing(null)
      })

      expect(context).toEqual({
        accreditation: { window: null, timeline: [] },
        overseasSites
      })
    }
  )

  it.each([
    ['EXPORTER_REGISTERED_ONLY', ORS_VALIDATION_DISABLED],
    ['EXPORTER', {}],
    ['REPROCESSOR_REGISTERED_ONLY', ORS_VALIDATION_DISABLED]
  ])(
    'classifies a registered-only %s summary log with no accreditation, without a lookup',
    async (processingType, overseasSites) => {
      const organisationReadRepository = readRepositoryServing(null)

      const context = await resolveClassificationContext({
        processingType,
        summaryLog: summaryLogWith({ accreditationNumber: null }),
        organisationReadRepository
      })

      expect(context).toEqual({ accreditation: null, overseasSites })
      expect(
        organisationReadRepository.findAccreditationByNumber
      ).not.toHaveBeenCalled()
    }
  )

  // Ruling 21: no fallback for a summary log without its stored numbers.
  it('refuses a summary log without its stored numbers', async () => {
    await expect(
      resolveClassificationContext({
        processingType: 'EXPORTER',
        summaryLog: summaryLogWith({ accreditationNumber: undefined }),
        organisationReadRepository: readRepositoryServing(servedAccreditation)
      })
    ).rejects.toThrow(
      'Cannot use summary log for registration reg-1 without its numbers: accreditationNumber'
    )
  })
})
