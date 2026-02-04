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

    // Split CSV into lines - note the header spans 3 lines due to multiline field
    const lines = csvData.split('\n').filter((line) => line.length > 0)
    expect(lines.length).toBe(5) // header (3 lines) + generated at row + data row

    // Verify header
    expect(lines[0]).toContain('Type,Business name,Companies House Number')

    // Verify generated at row has timestamp format DD.MM.YY HH:mm and rest empty
    const generatedAtRow = lines[3].split(',')
    expect(generatedAtRow[0]).toMatch(/^\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}$/)
    expect(generatedAtRow.slice(1).every((col) => col === '')).toBe(true)

    // Verify data row
    expect(lines[4]).toContain('Reprocessor,ACME ltd,AC012345,200001')
    expect(lines[4]).toContain(activeDate)
    expect(lines[4]).toContain(dateLastUpdated)
  })
})
