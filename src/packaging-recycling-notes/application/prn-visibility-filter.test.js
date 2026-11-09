import { describe, test, expect } from 'vitest'

import { createPrnVisibilityFilter } from './prn-visibility-filter.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'

const { buildOrganisation } = createOrganisationBuilders()

const organisationsRepositoryHolding = async (organisations) => {
  const repository = createInMemoryOrganisationsRepository()()
  for (const organisation of organisations) {
    await repository.insert(organisation)
  }
  return repository
}

describe('#createPrnVisibilityFilter', () => {
  test('returns empty excludeOrganisationIds when no test org IDs provided', async () => {
    const repository = await organisationsRepositoryHolding([
      buildOrganisation()
    ])

    const prnVisibilityFilter = await createPrnVisibilityFilter(repository, {
      testOrganisationIds: []
    })

    expect(prnVisibilityFilter.excludeOrganisationIds).toEqual([])
  })

  test('resolves organisation numbers to the organisations ids', async () => {
    const first = buildOrganisation()
    const second = buildOrganisation()
    const other = buildOrganisation()
    const repository = await organisationsRepositoryHolding([
      first,
      second,
      other
    ])

    const prnVisibilityFilter = await createPrnVisibilityFilter(repository, {
      testOrganisationIds: [first.orgId, second.orgId]
    })

    expect(prnVisibilityFilter.excludeOrganisationIds.toSorted()).toEqual(
      [first.id, second.id].toSorted()
    )
  })

  test('returns empty excludeOrganisationIds when no orgs are found', async () => {
    const repository = await organisationsRepositoryHolding([
      buildOrganisation()
    ])

    const prnVisibilityFilter = await createPrnVisibilityFilter(repository, {
      testOrganisationIds: [999999]
    })

    expect(prnVisibilityFilter.excludeOrganisationIds).toEqual([])
  })

  test('returns only found org IDs when some are missing', async () => {
    const found = buildOrganisation()
    const repository = await organisationsRepositoryHolding([found])

    const prnVisibilityFilter = await createPrnVisibilityFilter(repository, {
      testOrganisationIds: [found.orgId, 999999]
    })

    expect(prnVisibilityFilter.excludeOrganisationIds).toEqual([found.id])
  })
})
