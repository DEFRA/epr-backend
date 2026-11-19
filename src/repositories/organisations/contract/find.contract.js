import { beforeEach, describe, expect } from 'vitest'
import { getValidDateRange, prepareOrgUpdate } from './test-data.js'
import {
  ORGANISATION_STATUS,
  REGISTRATION_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'

/** @import { OrganisationBuilders } from './test-data.js' */

export const testFindBehaviour = (it) => {
  describe('find', () => {
    let repository
    /** @type {OrganisationBuilders['buildOrganisation']} */
    let buildOrganisation

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import('../port.js').OrganisationsRepositoryFactory, organisationBuilders: OrganisationBuilders }} */ {
          organisationsRepository,
          organisationBuilders
        }
      ) => {
        repository = await organisationsRepository()
        buildOrganisation = organisationBuilders.buildOrganisation
      }
    )

    describe('findAll', () => {
      it('returns empty array when no organisations exist', async () => {
        const result = await repository.findAll()

        expect(result).toEqual([])
      })

      it('returns all organisations', async () => {
        const org1 = buildOrganisation()
        const org2 = buildOrganisation()
        const org3 = buildOrganisation()

        await Promise.all(
          [org1, org2, org3].map((org) => repository.insert(org))
        )

        const result = await repository.findAll()

        expect(result).toHaveLength(3)
        expect(result.map((o) => o.organisationNumber)).toEqual(
          expect.arrayContaining([
            org1.organisationNumber,
            org2.organisationNumber,
            org3.organisationNumber
          ])
        )
      })
    })

    describe('findByLinkedDefraOrgId', () => {
      const DEFRA_ORG_ID_1 = '550e8400-e29b-41d4-a716-446655440001'
      const DEFRA_ORG_ID_2 = '550e8400-e29b-41d4-a716-446655440002'
      const DEFRA_ORG_ID_3 = '550e8400-e29b-41d4-a716-446655440003'
      const USER_ID_1 = '660e8400-e29b-41d4-a716-446655440001'
      const USER_ID_2 = '660e8400-e29b-41d4-a716-446655440002'
      const USER_ID_3 = '660e8400-e29b-41d4-a716-446655440003'

      it('returns null when no organisations exist', async () => {
        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_1)

        expect(result).toBeNull()
      })

      it('returns null when no organisation is linked to the given defra org ID', async () => {
        const unlinkedOrg = buildOrganisation()
        const orgLinkedToDifferentDefraId = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_2,
            orgName: 'Different Org',
            linkedBy: { email: 'test@example.com', id: USER_ID_1 },
            linkedAt: new Date().toISOString()
          }
        })
        await Promise.all(
          [unlinkedOrg, orgLinkedToDifferentDefraId].map((org) =>
            repository.insert(org)
          )
        )

        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_1)

        expect(result).toBeNull()
      })

      it('returns the organisation linked to the given defra org ID', async () => {
        const linkedOrg = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_1,
            orgName: 'Target Org',
            linkedBy: { email: 'linker@example.com', id: USER_ID_1 },
            linkedAt: new Date().toISOString()
          }
        })
        await repository.insert(linkedOrg)

        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_1)

        expect(result).not.toBeNull()
        expect(result.id).toBe(linkedOrg.id)
        expect(result.linkedDefraOrganisation.orgId).toBe(DEFRA_ORG_ID_1)
      })

      it('returns only the linked organisation when multiple organisations exist', async () => {
        const unlinkedOrg = buildOrganisation()

        const orgLinkedToDifferentDefraId = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_2,
            orgName: 'Other Org',
            linkedBy: { email: 'other@example.com', id: USER_ID_2 },
            linkedAt: new Date().toISOString()
          }
        })

        const orgLinkedToTargetDefraId = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_3,
            orgName: 'Target Org',
            linkedBy: { email: 'target@example.com', id: USER_ID_3 },
            linkedAt: new Date().toISOString()
          }
        })

        await Promise.all(
          [
            unlinkedOrg,
            orgLinkedToDifferentDefraId,
            orgLinkedToTargetDefraId
          ].map((org) => repository.insert(org))
        )

        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_3)

        expect(result).not.toBeNull()
        expect(result.id).toBe(orgLinkedToTargetDefraId.id)
        expect(result.linkedDefraOrganisation.orgId).toBe(DEFRA_ORG_ID_3)
      })

      it('returns organisation with computed status field', async () => {
        const linkedOrg = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_1,
            orgName: 'Target Org',
            linkedBy: { email: 'linker@example.com', id: USER_ID_1 },
            linkedAt: new Date().toISOString()
          }
        })
        await repository.insert(linkedOrg)

        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_1)

        expect(result.status).toBe('created')
      })
    })

    describe('findAllLinkableForUser', () => {
      const INITIAL_USER_EMAIL = 'initial.user@example.com'
      const OTHER_USER_EMAIL = 'other.user@example.com'
      const DEFRA_ORG_ID = '550e8400-e29b-41d4-a716-446655440001'
      const USER_ID = '660e8400-e29b-41d4-a716-446655440001'
      const { VALID_FROM } = getValidDateRange()

      const buildOrgWithSubmitter = (email, overrides = {}) =>
        buildOrganisation({
          submitterContactDetails: {
            fullName: 'Test User',
            email,
            phone: '01onal234567',
            jobTitle: 'Manager'
          },
          ...overrides
        })

      const approveOrg = async (org) => {
        const inserted = await repository.findById(org.id)
        const updatePayload = prepareOrgUpdate(inserted, {
          status: ORGANISATION_STATUS.APPROVED,
          registrations: [
            {
              ...inserted.registrations[0],
              status: REGISTRATION_STATUS.APPROVED,
              registrationNumber: `REG${org.organisationNumber}`,
              validFrom: VALID_FROM,
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ],
          accreditations: [
            {
              ...inserted.accreditations[0],
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ]
        })
        await repository.replace(org.id, 1, updatePayload)
        // Wait for the update to propagate to ensure stale cache is synced
        await repository.findById(org.id, 2)
      }

      // An organisation can only become active while linked (enforced by the
      // status-transition guard), so reach the active-but-unlinked state the
      // way production does: activate with a link, then remove the link while
      // the status stays active.
      const activateAndUnlinkOrg = async (org) => {
        await approveOrg(org)
        const approved = await repository.findById(org.id, 2)
        await repository.replace(
          org.id,
          2,
          prepareOrgUpdate(approved, {
            status: ORGANISATION_STATUS.ACTIVE,
            linkedDefraOrganisation: {
              orgId: DEFRA_ORG_ID,
              orgName: 'Active Org',
              linkedBy: { email: 'linker@example.com', id: USER_ID },
              linkedAt: new Date().toISOString()
            }
          })
        )
        const active = await repository.findById(org.id, 3)
        await repository.replace(
          org.id,
          3,
          prepareOrgUpdate(active, { linkedDefraOrganisation: undefined })
        )
        // Wait for the update to propagate to ensure stale cache is synced
        await repository.findById(org.id, 4)
      }

      it('returns empty array when no organisations exist', async () => {
        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toEqual([])
      })

      it('returns only the summary fields', async () => {
        const matchingOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        await repository.insert(matchingOrg)
        await approveOrg(matchingOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toEqual([
          {
            id: matchingOrg.id,
            organisationNumber: matchingOrg.organisationNumber,
            companyDetails: { name: matchingOrg.companyDetails.name },
            status: ORGANISATION_STATUS.APPROVED
          }
        ])
      })

      it('returns empty array when no organisations match criteria', async () => {
        const orgWithDifferentUser = buildOrgWithSubmitter(OTHER_USER_EMAIL)
        await repository.insert(orgWithDifferentUser)
        await approveOrg(orgWithDifferentUser)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toEqual([])
      })

      it('returns approved unlinked organisations where user is initial user', async () => {
        const matchingOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        await repository.insert(matchingOrg)
        await approveOrg(matchingOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(matchingOrg.id)
      })

      it('returns active unlinked organisations where user is initial user', async () => {
        const activeOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        await repository.insert(activeOrg)
        await activateAndUnlinkOrg(activeOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(activeOrg.id)
        expect(result[0].status).toBe(ORGANISATION_STATUS.ACTIVE)
      })

      it('excludes linked organisations', async () => {
        const linkedOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL, {
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID,
            orgName: 'Linked Org',
            linkedBy: { email: 'linker@example.com', id: USER_ID },
            linkedAt: new Date().toISOString()
          }
        })
        await repository.insert(linkedOrg)
        await approveOrg(linkedOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toEqual([])
      })

      it('excludes organisations that are not approved', async () => {
        const createdOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        await repository.insert(createdOrg)
        // Don't approve - leave as 'created'

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toEqual([])
      })

      it('matches email case-insensitively', async () => {
        const matchingOrg = buildOrgWithSubmitter('Initial.User@Example.COM')
        await repository.insert(matchingOrg)
        await approveOrg(matchingOrg)

        const result = await repository.findAllLinkableForUser(
          'initial.user@example.com'
        )

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(matchingOrg.id)
      })

      it('returns multiple matching organisations', async () => {
        const matchingOrg1 = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        const matchingOrg2 = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        const nonMatchingOrg = buildOrgWithSubmitter(OTHER_USER_EMAIL)

        await repository.insert(matchingOrg1)
        await repository.insert(matchingOrg2)
        await repository.insert(nonMatchingOrg)

        await approveOrg(matchingOrg1)
        await approveOrg(matchingOrg2)
        await approveOrg(nonMatchingOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toHaveLength(2)
        expect(result.map((o) => o.id)).toEqual(
          expect.arrayContaining([matchingOrg1.id, matchingOrg2.id])
        )
      })

      it('returns organisations with computed status field', async () => {
        const matchingOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        await repository.insert(matchingOrg)
        await approveOrg(matchingOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result[0].status).toBe(ORGANISATION_STATUS.APPROVED)
      })
    })
  })
}
