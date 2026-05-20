import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePublicRegister } from './generate-public-register.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { formatDateTimeDots } from '#common/helpers/date-formatter.js'

const FIXED_DATE = new Date('2026-04-17T10:00:00.000Z')

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
    await buildApprovedOrg(organisationRepo, { orgId: 200001 })

    const result = await generatePublicRegister(
      organisationRepo,
      publicRegisterRepo,
      reportsRepo
    )

    expect(result.url).toBeTruthy()

    const csvData = await publicRegisterRepo.fetchFromPresignedUrl(result.url)
    const generatedAt = formatDateTimeDots(FIXED_DATE)

    // At 2026-04-17: Jan, Feb, Mar (monthly) + Q1 (quarterly) → 20 columns total
    // Accredited operator (monthly cadence): monthly periods show '' (not submitted), Q1 shows N/A
    expect(csvData).toBe(
      '﻿' +
        `Generated at ${generatedAt},,,,,,,,,,,,,,,,,,,\n` +
        'Type,Business name,Companies House Number,Org ID,"Registered office\n' +
        'Head office\n' +
        'Main place of business in UK",Appropriate Agency,Registration number,Trading name,Registered Reprocessing site (UK),Packaging Waste Category,Annex II Process,Accreditation No,Active Date,Accreditation status,Date status last changed,Tonnage Band,Jan Report,Feb Report,Mar Report,Q1 Report\n' +
        'Reprocessor,ACME ltd,AC012345,200001,"Palace of Westminster, London, SW1A 0AA",EA,REG1,ACME ltd,"7 Glass processing site, London, SW2A 0AA",Glass-remelt,R5,ACC1,17/04/2026,Approved,17/04/2026,"Over 10,000 tonnes",,,,N/A'
    )
  })
})
