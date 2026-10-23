import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { reprocessor } from './contract/organisation-read-test-helpers.js'
import { toReadModelRegistration } from './adapter.js'

const { buildOrganisation } = createOrganisationBuilders()

describe('toReadModelRegistration', () => {
  /**
   * @param {ReturnType<typeof reprocessor>} registration
   */
  const stored = async (registration) => {
    const organisation = buildOrganisation({ registrations: [registration] })
    const found = await createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])().findById(organisation.id)
    return { organisation: found, registration: found.registrations[0] }
  }

  it('shows a registration the read model serves', async () => {
    const { organisation, registration } = await stored(reprocessor())

    expect(toReadModelRegistration(organisation, registration)?.validFrom).toBe(
      '2026-02-01'
    )
  })

  it('gives null for a registration the read model cannot show', async () => {
    const { organisation, registration } = await stored(
      reprocessor({ validFrom: undefined })
    )

    expect(toReadModelRegistration(organisation, registration)).toBeNull()
  })
})
