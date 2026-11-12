import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { generateSummaryLogUploadsReport } from './generate-report.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import {
  buildReadOrganisation,
  buildReadReprocessorRegistration,
  nextReadOrganisationNumber as nextOrganisationNumber,
  registrationOf,
  servedOrganisations
} from '#organisation-read-model/repository/read-model-test-data.js'
import { currentUtcYear } from '#common/helpers/dates/year.js'
import { ObjectId } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'

/**
 * @param {{ organisationNumber: string }} organisation
 * @param {{ registrationNumber: string }} registration
 */
const numbersOf = (organisation, registration) => ({
  organisationNumber: organisation.organisationNumber,
  registrationNumber: registration.registrationNumber
})

describe('generateSummaryLogUploadsReport', () => {
  let served
  let summaryLogsRepo
  let org
  let registration
  let accreditation
  const orgId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()

  beforeEach(async () => {
    served = servedOrganisations()
    summaryLogsRepo = createInMemorySummaryLogsRepository()(logger)

    org = served.approved({
      organisationNumber: nextOrganisationNumber(),
      year: currentUtcYear()
    })
    registration = registrationOf(org)
    accreditation = { accreditationNumber: `ACC${org.organisationNumber}` }
  })

  it('generates empty report when no SL uploads exist', async () => {
    const result = await generateSummaryLogUploadsReport(
      served.repository(),
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual([])
    expect(result.generatedAt).toBeDefined()
    expect(new Date(result.generatedAt)).toBeInstanceOf(Date)
  })

  it('generates report with registration info only', async () => {
    const submittedAt = '2026-01-15T10:30:00.000Z'

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: orgId,
        registrationId,
        ...numbersOf(org, registration),
        submittedAt
      })
    )

    const result = await generateSummaryLogUploadsReport(
      served.repository(),
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual([
      expect.objectContaining({
        appropriateAgency: 'EA',
        type: 'Reprocessor',
        businessName: org.name,
        organisationNumber: org.organisationNumber,
        registrationNumber: registration.registrationNumber,
        reprocessingSite: expect.any(String),
        packagingWasteCategory: expect.any(String),
        lastSuccessfulUpload: submittedAt,
        lastFailedUpload: '',
        successfulUploads: 1,
        failedUploads: 0
      })
    ])
    expect(result.generatedAt).toBeDefined()
  })

  it('generates report with registration and accreditation details', async () => {
    const submittedAt = '2026-01-15T10:30:00.000Z'

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: orgId,
        registrationId,
        ...numbersOf(org, registration),
        submittedAt
      })
    )

    const result = await generateSummaryLogUploadsReport(
      served.repository(),
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual([
      expect.objectContaining({
        registrationNumber: registration.registrationNumber,
        accreditationNumber: accreditation.accreditationNumber,
        lastSuccessfulUpload: submittedAt
      })
    ])
  })

  it('generates report for mix of two organisations with same upload patterns', async () => {
    const firstSuccessfulAt = '2026-01-15T10:30:00.000Z'
    const latestSuccessfulAt = '2026-01-20T14:00:00.000Z'
    const firstFailedAt = '2026-02-03T15:30:00.000Z'
    const latestFailedAt = '2026-02-05T09:00:00.000Z'

    // Create second org
    const org2 = served.approved({
      organisationNumber: nextOrganisationNumber(),
      year: currentUtcYear()
    })
    const registration2 = registrationOf(org2)
    const org2Id = new ObjectId().toString()
    const registration2Id = new ObjectId().toString()

    // Org 1 uploads
    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: orgId,
        registrationId,
        ...numbersOf(org, registration),
        submittedAt: firstSuccessfulAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: orgId,
        registrationId,
        ...numbersOf(org, registration),
        submittedAt: latestSuccessfulAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submissionFailed({
        organisationId: orgId,
        registrationId,
        ...numbersOf(org, registration),
        createdAt: firstFailedAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submissionFailed({
        organisationId: orgId,
        registrationId,
        ...numbersOf(org, registration),
        createdAt: latestFailedAt
      })
    )

    // Org 2 uploads (same pattern)
    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: org2Id,
        registrationId: registration2Id,
        ...numbersOf(org2, registration2),
        submittedAt: firstSuccessfulAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: org2Id,
        registrationId: registration2Id,
        ...numbersOf(org2, registration2),
        submittedAt: latestSuccessfulAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submissionFailed({
        organisationId: org2Id,
        registrationId: registration2Id,
        ...numbersOf(org2, registration2),
        createdAt: firstFailedAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submissionFailed({
        organisationId: org2Id,
        registrationId: registration2Id,
        ...numbersOf(org2, registration2),
        createdAt: latestFailedAt
      })
    )

    const result = await generateSummaryLogUploadsReport(
      served.repository(),
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organisationNumber: org.organisationNumber,
          registrationNumber: registration.registrationNumber,
          accreditationNumber: accreditation.accreditationNumber,
          lastSuccessfulUpload: latestSuccessfulAt,
          lastFailedUpload: latestFailedAt,
          successfulUploads: 2,
          failedUploads: 2
        }),
        expect.objectContaining({
          organisationNumber: org2.organisationNumber,
          registrationNumber: registration2.registrationNumber,
          lastSuccessfulUpload: latestSuccessfulAt,
          lastFailedUpload: latestFailedAt,
          successfulUploads: 2,
          failedUploads: 2
        })
      ])
    )
  })

  it('excludes summary logs without matching organisation/registration', async () => {
    const createdAt = '2026-01-15T10:30:00.000Z'

    // Insert summary log for org that exists
    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: orgId,
        registrationId,
        ...numbersOf(org, registration),
        createdAt
      })
    )

    // Insert summary log for non-existent org/registration
    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: new ObjectId().toString(),
        registrationId: new ObjectId().toString(),
        organisationNumber: nextOrganisationNumber(),
        registrationNumber: toRegistrationNumber('R26ER9999999999PA'),
        createdAt
      })
    )

    const result = await generateSummaryLogUploadsReport(
      served.repository(),
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual([
      expect.objectContaining({
        organisationNumber: org.organisationNumber,
        registrationNumber: registration.registrationNumber
      })
    ])
  })

  it('leaves out a registration that carries no number', async () => {
    // The read model serves no registration for this organisation.
    const unapprovedOrg = { organisationNumber: nextOrganisationNumber() }

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: new ObjectId().toString(),
        registrationId: new ObjectId().toString(),
        organisationNumber: unapprovedOrg.organisationNumber
      })
    )

    const result = await generateSummaryLogUploadsReport(
      served.repository(),
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual([])
  })

  it('gives an empty accreditation number for a registration with no accreditation', async () => {
    const registrationNumber = toRegistrationNumber('R26ER5000000001PA')
    const registeredOnlyOrg = served.add(
      buildReadOrganisation({
        organisationNumber: nextOrganisationNumber(),
        registrations: {
          [registrationNumber]: buildReadReprocessorRegistration()
        }
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: new ObjectId().toString(),
        registrationId: new ObjectId().toString(),
        organisationNumber: registeredOnlyOrg.organisationNumber,
        registrationNumber
      })
    )

    const result = await generateSummaryLogUploadsReport(
      served.repository(),
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual([
      expect.objectContaining({
        registrationNumber,
        accreditationNumber: ''
      })
    ])
  })

  describe('from a read model holding an exporter with three accreditation years', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("shows no reprocessing site and the current year's accreditation", async () => {
      const organisationNumber = nextOrganisationNumber()
      const registrationNumber = toRegistrationNumber('R26EX5000000001PA')
      const accreditation = (accreditationNumber) => ({
        accreditationNumber,
        prnIssuance: { tonnageBand: 'up_to_500' },
        status: { current: 'approved', timeline: [] },
        overseasSites: {}
      })
      const exporter = {
        wasteProcessingType: 'exporter',
        material: 'plastic',
        submittedToRegulator: { code: 'nrw' },
        accreditations: {
          2025: accreditation('ACC-2025'),
          2026: accreditation('ACC-2026'),
          2027: accreditation('ACC-2027')
        }
      }
      const readModel = {
        findAll: async () => [
          {
            organisationNumber,
            name: 'Exporter ltd',
            registrations: { [registrationNumber]: exporter }
          }
        ]
      }

      await summaryLogsRepo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: new ObjectId().toString(),
          registrationId: new ObjectId().toString(),
          organisationNumber,
          registrationNumber
        })
      )

      const result = await generateSummaryLogUploadsReport(
        /** @type {any} */ (readModel),
        summaryLogsRepo
      )

      expect(result.summaryLogUploads).toEqual([
        expect.objectContaining({
          appropriateAgency: 'NRW',
          type: 'Exporter',
          businessName: 'Exporter ltd',
          accreditationNumber: 'ACC-2026',
          reprocessingSite: '',
          packagingWasteCategory: 'Plastic'
        })
      ])
    })
  })
})
