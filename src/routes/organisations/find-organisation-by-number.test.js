import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { findOrganisationByNumber } from './find-organisation-by-number.js'

const { buildOrganisation } = createOrganisationBuilders()

describe('findOrganisationByNumber', () => {
  it('finds an organisation by its number', async () => {
    const organisation = buildOrganisation()

    const found = await findOrganisationByNumber(
      createInMemoryOrganisationsRepository([partialMock(organisation)])(),
      organisation.organisationNumber
    )

    expect(found.id).toBe(organisation.id)
  })

  it('rejects an organisation the read model does not serve', async () => {
    const organisation = buildOrganisation({
      statusHistory: [{ status: 'approved', updatedAt: '2999-01-01' }]
    })

    await expect(
      findOrganisationByNumber(
        createInMemoryOrganisationsRepository([partialMock(organisation)])(),
        organisation.organisationNumber
      )
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })
})
