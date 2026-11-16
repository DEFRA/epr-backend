import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePublicRegister } from './generate-public-register.js'
import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import { buildReadApprovedOrganisation } from '#organisation-read-model/repository/read-model-test-data.js'
import { formatDateTimeDots } from '#common/helpers/date-formatter.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'

const FIXED_DATE = new Date('2026-04-17T10:00:00.000Z')

// Accredited from the start of the reporting year, so every ended period of the
// year is within the accreditation window (no validFrom trim) — the register
// then shows monthly obligations as due ('') rather than N/A.
/**
 * The organisation the read model serves: accredited from 1 January 2026,
 * with its approvals recorded on `FIXED_DATE`.
 */
const servedOrganisation = () => {
  const approved = {
    current: /** @type {const} */ ('approved'),
    lastUpdatedAt: FIXED_DATE.toISOString(),
    timeline: [
      {
        status: /** @type {const} */ ('approved'),
        at: '2026-01-01T00:00:00.000Z'
      }
    ]
  }
  const organisation = buildReadApprovedOrganisation({
    organisationNumber: toOrganisationNumber('200001'),
    year: 2026
  })
  const registration =
    /** @type {import('#organisation-read-model/domain/model.js').ReprocessorRegistration} */ (
      organisation.registrations.REG200001
    )
  return {
    ...organisation,
    tradingName: 'ACME ltd',
    companiesHouseNumber: 'AC012345',
    registeredAddress: {
      line1: 'Palace of Westminster',
      town: 'London',
      postcode: 'SW1A 0AA'
    },
    registrations: {
      REG200001: {
        ...registration,
        status: approved,
        accreditations: {
          2026: { ...registration.accreditations[2026], status: approved }
        }
      }
    }
  }
}

describe('generatePublicRegister', () => {
  let publicRegisterRepo
  let reportsRepo

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FIXED_DATE)
    publicRegisterRepo = createInMemoryPublicRegisterRepository()
    reportsRepo = createInMemoryReportsRepository()()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('generates public register with approved registration and accreditation', async () => {
    const result = await generatePublicRegister(
      createInMemoryOrganisationReadRepository([servedOrganisation()])(),
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
        'Reprocessor,ACME ltd,AC012345,200001,"Palace of Westminster, London, SW1A 0AA",EA,REG200001,ACME ltd,"7 Glass processing site, London, SW2A 0AA",Glass-remelt,R5,ACC200001,01/01/2026,Approved,17/04/2026,"Over 10,000 tonnes",,,,N/A'
    )
  })
})
