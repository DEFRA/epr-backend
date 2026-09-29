import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePublicRegister } from './generate-public-register.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { seedInFlightResubmission } from '#vite/helpers/seed-inflight-resubmission.js'
import {
  formatDate,
  formatDateTimeDots
} from '#common/helpers/date-formatter.js'

const FIXED_DATE = new Date('2026-04-17T10:00:00.000Z')

// Accredited from the start of the reporting year, so every ended period of the
// year is within the accreditation window (no validFrom trim) — the register
// then shows monthly obligations as due ('') rather than N/A.
const FULL_YEAR_RANGE = { VALID_FROM: '2026-01-01', VALID_TO: '2026-12-31' }

// Distinct instants so each date-bearing CSV cell is asserted against a value
// unique to itself: org approved at FIXED_DATE (17 Apr → status-changed column),
// submission 1 on 20 Apr (the published register date), the register generated on
// 22 Apr. All within April, so no further monthly period ends and the applicable
// set (Jan/Feb/Mar + Q1) is unchanged.
const ORIGINAL_SUBMISSION = new Date('2026-04-20T10:00:00.000Z')
const GENERATED = new Date('2026-04-22T10:00:00.000Z')

// 'Date status last changed' is the org's approval instant. buildApprovedOrg
// approves while the clock is at FIXED_DATE, so both scenarios below share this
// value; a scenario that approves at another time overrides `statusChanged`.
const APPROVED_AT = formatDate(FIXED_DATE)

// The register for the single approved orgId-200001 operator. Everything but the
// generated-at timestamp, the status-changed date and the four period columns is
// fixed, so a scenario is expressed as those inputs (periods = [Jan, Feb, Mar, Q1]).
const expectedCsv = ({ generatedAt, periods, statusChanged = APPROVED_AT }) =>
  '﻿' +
  `Generated at ${generatedAt},,,,,,,,,,,,,,,,,,,\n` +
  'Type,Business name,Companies House Number,Org ID,"Registered office\n' +
  'Head office\n' +
  'Main place of business in UK",Appropriate Agency,Registration number,Trading name,Registered Reprocessing site (UK),Packaging Waste Category,Annex II Process,Accreditation No,Active Date,Accreditation status,Date status last changed,Tonnage Band,Jan Report,Feb Report,Mar Report,Q1 Report\n' +
  `Reprocessor,ACME ltd,AC012345,200001,"Palace of Westminster, London, SW1A 0AA",EA,REG1,ACME ltd,"7 Glass processing site, London, SW2A 0AA",Glass-remelt,R5,ACC1,01/01/2026,Approved,${statusChanged},"Over 10,000 tonnes"` +
  ',' +
  periods.join(',')

describe('generatePublicRegister', () => {
  let organisationRepo
  let publicRegisterRepo
  let reportsRepo

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FIXED_DATE)
    organisationRepo = createInMemoryOrganisationsRepository()()
    publicRegisterRepo = createInMemoryPublicRegisterRepository()
    reportsRepo = createInMemoryReportsRepository()()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('generates public register with approved registration and accreditation', async () => {
    await buildApprovedOrg(organisationRepo, { orgId: 200001 }, FULL_YEAR_RANGE)

    const result = await generatePublicRegister(
      organisationRepo,
      publicRegisterRepo,
      reportsRepo
    )

    expect(result.url).toBeTruthy()

    const csvData = await publicRegisterRepo.fetchFromPresignedUrl(result.url)
    const generatedAt = formatDateTimeDots(FIXED_DATE)

    // At 2026-04-17: Jan, Feb, Mar (monthly) + Q1 (quarterly). Accredited (monthly
    // cadence): monthly periods show '' (not submitted), Q1 shows N/A.
    expect(csvData).toBe(
      expectedCsv({ generatedAt, periods: ['', '', '', 'N/A'] })
    )
  })

  it('shows the original submission date in the CSV while a resubmission is in progress', async () => {
    const org = await buildApprovedOrg(
      organisationRepo,
      { orgId: 200001 },
      FULL_YEAR_RANGE
    )

    // Submission 1 submitted (20 Apr) with an in-flight submission 2 draft over it:
    // the draft is the current report but carries no submitted date, so a naive
    // read would blank a period that has in fact been submitted.
    vi.setSystemTime(ORIGINAL_SUBMISSION)
    await seedInFlightResubmission(reportsRepo, {
      organisationId: org.id,
      registrationId: org.registrations[0].id,
      year: 2026,
      cadence: 'monthly',
      period: 1
    })

    // Generate after the submission; no month ends in between, so the period set
    // is unchanged.
    vi.setSystemTime(GENERATED)
    const result = await generatePublicRegister(
      organisationRepo,
      publicRegisterRepo,
      reportsRepo
    )

    const csvData = await publicRegisterRepo.fetchFromPresignedUrl(result.url)
    const generatedAt = formatDateTimeDots(GENERATED)

    // Jan Report = submission 1's 20/04/2026, distinct from every other dated cell
    // (active 01/01, status-changed 17/04, generated 22/04). The completed-
    // resubmission variant (submission 2 itself submitted) is covered a layer down
    // in report-compliance.test.js, so is not re-driven through the CSV here.
    expect(csvData).toBe(
      expectedCsv({ generatedAt, periods: ['20/04/2026', '', '', 'N/A'] })
    )
  })
})
