import { describe, expect, it, beforeEach } from 'vitest'
import { generatePublicRegister } from './generate-public-register.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { formatDate } from '#common/helpers/date-formatter.js'
import { getValidDateRange } from '#repositories/organisations/contract/test-data.js'

describe('generatePublicRegister', () => {
  let organisationRepo
  let publicRegisterRepo

  beforeEach(() => {
    organisationRepo = createInMemoryOrganisationsRepository()()
    publicRegisterRepo = createInMemoryPublicRegisterRepository()
  })

  it('generates public register with approved registration and accreditation', async () => {
    await buildApprovedOrg(organisationRepo, { orgId: 200001 })

    const result = await generatePublicRegister(
      organisationRepo,
      publicRegisterRepo
    )

    expect(result.url).toBeTruthy()

    const csvData = await publicRegisterRepo.fetchFromPresignedUrl(result.url)

    const { VALID_FROM } = getValidDateRange()
    const activeDate = formatDate(VALID_FROM)
    const dateLastUpdated = formatDate(new Date(Date.now()))

    const expectedCsv = `\uFEFFType,Business name,"Registered office
Head office
Main place of business in UK",Appropriate Agency,Registration number,Trading name,Registered Reprocessing site (UK),Packaging Waste Category,Annex II Process,Accreditation No,Active Date,Accreditation status,Date status last changed,Tonnage Band
Reprocessor,ACME ltd,"Palace of Westminster, London, SW1A 0AA",EA,REG1,ACME ltd,"7 Glass processing site, London, SW2A 0AA",Glass-remelt,R5,ACC1,${activeDate},Approved,${dateLastUpdated},"Over 10,000 tonnes"`

    expect(csvData).toBe(expectedCsv)
  })
})
