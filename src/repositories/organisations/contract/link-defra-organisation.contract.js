import crypto from 'node:crypto'
import {
  ORGANISATION_STATUS,
  REGISTRATION_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildLinkedDefraOrg,
  getValidDateRange,
  prepareOrgUpdate
} from './test-data.js'

/** @import { OrganisationBuilders } from './test-data.js' */
/** @import { OrganisationsRepository, OrganisationsRepositoryFactory } from '../port.js' */

const versionConflict = (version, currentVersion) => ({
  isBoom: true,
  output: {
    statusCode: 409,
    payload: {
      message: `Version conflict: attempted to update with version ${version} but current version is ${currentVersion}`
    }
  }
})

const notFound = { isBoom: true, output: { statusCode: 404 } }

/** @param {{ orgId: number }} organisation */
const numberOf = ({ orgId }) => toOrganisationNumber(String(orgId))

export const testLinkDefraOrganisationBehaviour = (it) => {
  describe('linking to a Defra organisation', () => {
    /** @type {OrganisationsRepository} */
    let repository
    /** @type {OrganisationBuilders['buildOrganisation']} */
    let buildOrganisation
    const { VALID_FROM } = getValidDateRange()

    beforeEach(
      async (
        /** @type {{ organisationsRepository: OrganisationsRepositoryFactory, organisationBuilders: OrganisationBuilders }} */ {
          organisationsRepository,
          organisationBuilders
        }
      ) => {
        repository = await organisationsRepository()
        buildOrganisation = organisationBuilders.buildOrganisation
      }
    )

    /** Inserts an organisation and approves it, leaving it at version 2. */
    const insertApprovedOrg = async () => {
      const org = buildOrganisation()
      await repository.insert(org)
      await repository.replace(
        org.id,
        1,
        prepareOrgUpdate(org, {
          status: ORGANISATION_STATUS.APPROVED,
          registrations: [
            {
              ...org.registrations[0],
              status: REGISTRATION_STATUS.APPROVED,
              registrationNumber: `REG${org.orgId}`,
              validFrom: VALID_FROM,
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ],
          accreditations: [
            {
              ...org.accreditations[0],
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ]
        })
      )
      return repository.findById(org.id, 2)
    }

    const aLink = () => buildLinkedDefraOrg(crypto.randomUUID(), 'Defra Org')

    describe('linkDefraOrganisation', () => {
      it('links an approved organisation and makes it active', async () => {
        const approved = await insertApprovedOrg()
        const link = aLink()

        await repository.linkDefraOrganisation(numberOf(approved), 2, link)

        const linked = await repository.findById(approved.id, 3)
        expect(linked.status).toBe(ORGANISATION_STATUS.ACTIVE)
        expect(linked.linkedDefraOrganisation).toEqual({
          ...link,
          linkedAt: new Date(link.linkedAt)
        })
        expect(linked.statusHistory.map(({ status }) => status)).toEqual([
          ORGANISATION_STATUS.CREATED,
          ORGANISATION_STATUS.APPROVED,
          ORGANISATION_STATUS.ACTIVE
        ])
      })

      it('changes nothing else on the organisation', async () => {
        const approved = await insertApprovedOrg()

        await repository.linkDefraOrganisation(numberOf(approved), 2, aLink())

        const {
          linkedDefraOrganisation: _link,
          status: _status,
          statusHistory: _history,
          version,
          ...rest
        } = await repository.findById(approved.id, 3)
        const {
          status: _s,
          statusHistory: _h,
          version: before,
          ...restBefore
        } = approved
        expect(version).toBe(before + 1)
        expect(rest).toEqual(restBefore)
      })

      it('re-links an active, unlinked organisation without a new status entry', async () => {
        const approved = await insertApprovedOrg()
        await repository.linkDefraOrganisation(numberOf(approved), 2, aLink())
        await repository.unlinkDefraOrganisation(numberOf(approved), 3)
        const link = aLink()

        await repository.linkDefraOrganisation(numberOf(approved), 4, link)

        const relinked = await repository.findById(approved.id, 5)
        expect(relinked.status).toBe(ORGANISATION_STATUS.ACTIVE)
        expect(relinked.linkedDefraOrganisation?.orgId).toBe(link.orgId)
        expect(relinked.statusHistory).toHaveLength(3)
      })

      it('rejects an organisation that is already linked and keeps its link', async () => {
        const approved = await insertApprovedOrg()
        const link = aLink()
        await repository.linkDefraOrganisation(numberOf(approved), 2, link)
        await repository.findById(approved.id, 3)

        await expect(
          repository.linkDefraOrganisation(numberOf(approved), 3, aLink())
        ).rejects.toMatchObject({
          isBoom: true,
          output: {
            statusCode: 409,
            payload: {
              message: 'Organisation is already linked to a Defra organisation'
            }
          }
        })

        const unchanged = await repository.findById(approved.id)
        expect(unchanged.version).toBe(3)
        expect(unchanged.linkedDefraOrganisation?.orgId).toBe(link.orgId)
      })

      it('rejects an organisation that cannot become active', async () => {
        const org = buildOrganisation()
        await repository.insert(org)

        await expect(
          repository.linkDefraOrganisation(numberOf(org), 1, aLink())
        ).rejects.toMatchObject({
          isBoom: true,
          output: {
            statusCode: 422,
            payload: {
              message: `Cannot transition organisation status from ${ORGANISATION_STATUS.CREATED} to ${ORGANISATION_STATUS.ACTIVE}`
            }
          }
        })
      })

      it('rejects an invalid link', async () => {
        const approved = await insertApprovedOrg()

        await expect(
          repository.linkDefraOrganisation(numberOf(approved), 2, {
            ...aLink(),
            orgId: 'not-a-uuid'
          })
        ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 422 } })
      })

      it('rejects a stale version and leaves the organisation unlinked', async () => {
        const approved = await insertApprovedOrg()

        await expect(
          repository.linkDefraOrganisation(numberOf(approved), 1, aLink())
        ).rejects.toMatchObject(versionConflict(1, 2))

        const unchanged = await repository.findById(approved.id)
        expect(unchanged.version).toBe(2)
        expect(unchanged.linkedDefraOrganisation).toBeUndefined()
      })

      it('rejects an organisation that does not exist', async () => {
        await expect(
          repository.linkDefraOrganisation(
            numberOf(buildOrganisation()),
            1,
            aLink()
          )
        ).rejects.toMatchObject(notFound)
      })
    })

    describe('unlinkDefraOrganisation', () => {
      it('removes the link and leaves the organisation active', async () => {
        const approved = await insertApprovedOrg()
        await repository.linkDefraOrganisation(numberOf(approved), 2, aLink())

        await repository.unlinkDefraOrganisation(numberOf(approved), 3)

        const unlinked = await repository.findById(approved.id, 4)
        expect(unlinked.linkedDefraOrganisation).toBeUndefined()
        expect(unlinked.status).toBe(ORGANISATION_STATUS.ACTIVE)
        expect(unlinked.statusHistory).toHaveLength(3)
      })

      it('makes the organisation linkable again', async () => {
        const approved = await insertApprovedOrg()
        const link = aLink()
        await repository.linkDefraOrganisation(numberOf(approved), 2, link)

        await repository.unlinkDefraOrganisation(numberOf(approved), 3)
        await repository.findById(approved.id, 4)

        expect(await repository.findByLinkedDefraOrgId(link.orgId)).toBeNull()
      })

      it('rejects a stale version and keeps the link', async () => {
        const approved = await insertApprovedOrg()
        const link = aLink()
        await repository.linkDefraOrganisation(numberOf(approved), 2, link)
        await repository.findById(approved.id, 3)

        await expect(
          repository.unlinkDefraOrganisation(numberOf(approved), 2)
        ).rejects.toMatchObject(versionConflict(2, 3))

        const unchanged = await repository.findById(approved.id)
        expect(unchanged.version).toBe(3)
        expect(unchanged.linkedDefraOrganisation?.orgId).toBe(link.orgId)
      })

      it('rejects an organisation that does not exist', async () => {
        await expect(
          repository.unlinkDefraOrganisation(numberOf(buildOrganisation()), 1)
        ).rejects.toMatchObject(notFound)
      })
    })
  })
}
