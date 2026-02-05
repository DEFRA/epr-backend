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

    const lines = csvData.split('\n').filter((line) => line.length > 0)
    expect(lines.length).toBe(5) // generated at row + header (3 lines) + data row

    expect(lines[0]).toMatch(
      /^(\uFEFF)?Generated at \d{2}\.\d{2}\.\d{2} \d{2}:\d{2}(,){15}$/
    )

    // Verify header (starts on line 1)
    expect(lines[1]).toContain('Type,Business name,Companies House Number')

    // Verify data row
    expect(lines[4]).toContain('Reprocessor,ACME ltd,AC012345,200001')
    expect(lines[4]).toContain(activeDate)
    expect(lines[4]).toContain(dateLastUpdated)
  })
})
