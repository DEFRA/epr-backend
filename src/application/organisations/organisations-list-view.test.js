import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrgWithCriteria } from '#repositories/organisations/contract/test-data.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { USER_ROLES } from '#domain/organisations/model.js'
import { createOrganisationsListView } from './organisations-list-view.js'

const REGULATOR_SCOPES = [SCOPES.organisationSearch, SCOPES.organisationRead]
const ADMIN_SCOPES = [SCOPES.adminRead, SCOPES.organisationSearch]

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

  beforeEach(async () => {
    organisationsRepository = createInMemoryOrganisationsRepository([])()
    organisation = buildOrganisationWithPersonalData()
    await organisationsRepository.insert(organisation)
  })

  /** @param {string[]} scopes */
  const viewFor = (scopes) =>
    createOrganisationsListView({ organisationsRepository, scopes })

  describe('a regulator credential', () => {
    it('reads the name, the ids and the status, and nothing else', async () => {
      const { items } = await viewFor(REGULATOR_SCOPES).find({
        page: 1,
        pageSize: 50
      })

      expect(items).toEqual([
        {
          id: organisation.id,
          orgId: 500118,
          companyDetails: { name: 'Kirkby Plastics Ltd' },
          status: 'created',
          submittedToRegulator: 'ea'
        }
      ])
    })

    it('reads the same shape from the no-criteria branch', async () => {
      const organisations = await viewFor(REGULATOR_SCOPES).findAll()

      expect(organisations).toEqual([
        {
          id: organisation.id,
          orgId: 500118,
          companyDetails: { name: 'Kirkby Plastics Ltd' },
          status: 'created',
          submittedToRegulator: 'ea'
        }
      ])
    })

    it('keeps the pagination envelope', async () => {
      const page = await viewFor(REGULATOR_SCOPES).find({
        page: 1,
        pageSize: 10
      })

      expect(page).toMatchObject({
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1
      })
    })
  })

  describe('an admin credential', () => {
    it('reads every field the back office organisations table renders', async () => {
      const { items } = await viewFor(ADMIN_SCOPES).find({
        page: 1,
        pageSize: 50
      })

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

    it('reads the same shape from the no-criteria branch', async () => {
      const [fromFindAll] = await viewFor(ADMIN_SCOPES).findAll()
      const { items } = await viewFor(ADMIN_SCOPES).find({
        page: 1,
        pageSize: 50
      })

      expect(fromFindAll).toEqual(items[0])
    })

    it('reads no operator or maintainer contact', async () => {
      const { items } = await viewFor(ADMIN_SCOPES).find({
        page: 1,
        pageSize: 50
      })

      expect(items[0]).not.toHaveProperty('users')
      expect(items[0]).not.toHaveProperty('linkedDefraOrganisation')
      expect(items[0]).not.toHaveProperty('submitterContactDetails')
    })
  })

  it('reads the narrow shape when the caller holds no scopes at all', async () => {
    const { items } = await viewFor([]).find({ page: 1, pageSize: 50 })

    expect(items).toEqual([
      {
        id: organisation.id,
        orgId: 500118,
        companyDetails: { name: 'Kirkby Plastics Ltd' },
        status: 'created',
        submittedToRegulator: 'ea'
      }
    ])
  })
})
