import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrgWithCriteria } from '#repositories/organisations/contract/test-data.js'
import { USER_ROLES } from '#domain/organisations/model.js'
import { createOrganisationsListView } from './organisations-list-view.js'

/**
 * An organisation carrying every field the list route used to hand out: the
 * operator's staff, our own staff, and the form submission behind the record.
 */
const buildOrganisationWithPersonalData = () => ({
  ...buildOrgWithCriteria({
    name: 'Kirkby Plastics Ltd',
    orgId: 500118,
    registrationNumber: 'R26ER5001180041PL',
    accreditationNumber: 'A26ER5001180114PL'
  }),
  users: [
    {
      contactId: 'contact-1',
      email: 'jo.sample@example.com',
      fullName: 'Jo Sample',
      roles: [USER_ROLES.STANDARD]
    }
  ],
  linkedDefraOrganisation: {
    orgId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    orgName: 'Kirkby Plastics Ltd',
    linkedAt: '2026-01-02T00:00:00.000Z',
    linkedBy: {
      id: '3f2504e0-4f89-11d3-9a0c-0305e82c3302',
      email: 'maintainer@example.com'
    }
  }
})

describe('organisations list view', () => {
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */
  let organisationsRepository

  /** @type {Omit<import('#domain/organisations/model.js').Organisation, 'status'>} */
  let organisation

  /** @type {import('./organisations-list-view.js').OrganisationsListView} */
  let view

  beforeEach(async () => {
    organisationsRepository = createInMemoryOrganisationsRepository([])()
    organisation = buildOrganisationWithPersonalData()
    await organisationsRepository.insert(organisation)
    view = createOrganisationsListView({ organisationsRepository })
  })

  it('reads the organisation identity and the published numbers', async () => {
    const { items } = await view.find({ page: 1, pageSize: 50 })

    expect(items).toEqual([
      {
        id: organisation.id,
        orgId: 500118,
        companyDetails: { name: 'Kirkby Plastics Ltd' },
        status: 'created',
        submittedToRegulator: 'ea',
        registrations: [
          {
            registrationNumber: 'R26ER5001180041PL',
            accreditationId: expect.any(String)
          },
          { registrationNumber: null }
        ],
        accreditations: [
          {
            id: expect.any(String),
            accreditationNumber: 'A26ER5001180114PL'
          },
          { id: expect.any(String), accreditationNumber: null },
          { id: expect.any(String), accreditationNumber: null }
        ]
      }
    ])
  })

  it('pairs each registration with its accreditation', async () => {
    const { items } = await view.find({ page: 1, pageSize: 50 })

    expect(items[0].registrations[0].accreditationId).toEqual(
      items[0].accreditations[0].id
    )
  })

  it('reads the same item from the no-criteria branch', async () => {
    const [fromFindAll] = await view.findAll()
    const { items } = await view.find({ page: 1, pageSize: 50 })

    expect(fromFindAll).toEqual(items[0])
  })

  it('keeps the pagination envelope', async () => {
    const page = await view.find({ page: 1, pageSize: 10 })

    expect(page).toMatchObject({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1
    })
  })
})
