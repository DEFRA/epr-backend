import { describe, expect, it, beforeEach } from 'vitest'
import { assertPresent } from '#test/type-helpers.js'
import { generateSummaryLogUploadsReport } from './generate-report.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import {
  buildOrganisation,
  generateOrgId
} from '#repositories/organisations/contract/test-data.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { ObjectId } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'

describe('generateSummaryLogUploadsReport', () => {
  let organisationRepo
  let summaryLogsRepo
  let org
  let registration
  let accreditation

  beforeEach(async () => {
    organisationRepo = createInMemoryOrganisationsRepository()()
    summaryLogsRepo = createInMemorySummaryLogsRepository()(logger)

    const orgId = generateOrgId()
    org = await buildApprovedOrg(organisationRepo, { orgId })
    registration = org.registrations[0]
    accreditation = org.accreditations[0]
  })

  it('generates empty report when no SL uploads exist', async () => {
    const result = await generateSummaryLogUploadsReport(
      organisationRepo,
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
        organisationId: org.id,
        registrationId: registration.id,
        submittedAt
      })
    )

    const result = await generateSummaryLogUploadsReport(
      organisationRepo,
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual([
      expect.objectContaining({
        appropriateAgency: registration.submittedToRegulator.toUpperCase(),
        type: 'Reprocessor',
        businessName: org.companyDetails.name,
        orgId: org.orgId,
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
        organisationId: org.id,
        registrationId: registration.id,
        submittedAt
      })
    )

    const result = await generateSummaryLogUploadsReport(
      organisationRepo,
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
    const org2 = await buildApprovedOrg(organisationRepo, {
      orgId: generateOrgId()
    })
    const registration2 = org2.registrations[0]

    // Org 1 uploads
    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: org.id,
        registrationId: registration.id,
        submittedAt: firstSuccessfulAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: org.id,
        registrationId: registration.id,
        submittedAt: latestSuccessfulAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submissionFailed({
        organisationId: org.id,
        registrationId: registration.id,
        createdAt: firstFailedAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submissionFailed({
        organisationId: org.id,
        registrationId: registration.id,
        createdAt: latestFailedAt
      })
    )

    // Org 2 uploads (same pattern)
    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: org2.id,
        registrationId: registration2.id,
        submittedAt: firstSuccessfulAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: org2.id,
        registrationId: registration2.id,
        submittedAt: latestSuccessfulAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submissionFailed({
        organisationId: org2.id,
        registrationId: registration2.id,
        createdAt: firstFailedAt
      })
    )

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submissionFailed({
        organisationId: org2.id,
        registrationId: registration2.id,
        createdAt: latestFailedAt
      })
    )

    const result = await generateSummaryLogUploadsReport(
      organisationRepo,
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orgId: org.orgId,
          registrationNumber: registration.registrationNumber,
          accreditationNumber: accreditation.accreditationNumber,
          lastSuccessfulUpload: latestSuccessfulAt,
          lastFailedUpload: latestFailedAt,
          successfulUploads: 2,
          failedUploads: 2
        }),
        expect.objectContaining({
          orgId: org2.orgId,
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
        organisationId: org.id,
        registrationId: registration.id,
        createdAt
      })
    )

    // Insert summary log for non-existent org/registration
    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: new ObjectId().toString(),
        registrationId: new ObjectId().toString(),
        createdAt
      })
    )

    const result = await generateSummaryLogUploadsReport(
      organisationRepo,
      summaryLogsRepo
    )

    expect(result.summaryLogUploads).toEqual([
      expect.objectContaining({
        orgId: org.orgId,
        registrationNumber: registration.registrationNumber
      })
    ])
  })

  it('returns empty strings when the registration and accreditation carry no numbers', async () => {
    const createdAt = '2026-01-15T10:30:00.000Z'

    const unapprovedOrg = buildOrganisation({ orgId: generateOrgId() })
    await organisationRepo.insert(unapprovedOrg)

    await summaryLogsRepo.insert(
      new ObjectId().toString(),
      summaryLogFactory.submitted({
        organisationId: unapprovedOrg.id,
        registrationId: unapprovedOrg.registrations[0].id,
        createdAt
      })
    )

    const result = await generateSummaryLogUploadsReport(
      organisationRepo,
      summaryLogsRepo
    )

    const row = result.summaryLogUploads.find(
      (r) => r.orgId === unapprovedOrg.orgId
    )

    assertPresent(row)
    expect(row.registrationNumber).toBe('')
    expect(row.accreditationNumber).toBe('')
  })
})
