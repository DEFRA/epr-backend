import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { ObjectId } from 'mongodb'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildOrganisation,
  prepareOrgUpdate,
  getValidDateRange
} from './test-data.js'

/**
 * Contract suite for OrganisationsRepository.appendStatusHistory.
 *
 * @param {import('vitest').TestAPI<{ organisationsRepository: import('../port.js').OrganisationsRepositoryFactory }>} it
 */
export const appendStatusHistoryContract = (it) => {
  const { VALID_FROM, VALID_TO } = getValidDateRange()

  describe('appendStatusHistory', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import("../port.js").OrganisationsRepositoryFactory }} */ {
          organisationsRepository
        }
      ) => {
        repository = await organisationsRepository()
      }
    )

    /**
     * Seeds an organisation with one APPROVED registration linked to an APPROVED
     * accreditation. Returns identifiers and the current version (post-approval).
     *
     * @returns {Promise<{ id: string, version: number, registrationId: string, accreditationId: string }>}
     */
    const seedApprovedRegLinkedToApprovedAcc = async () => {
      const organisation = buildOrganisation()
      await repository.insert(organisation)
      const inserted = await repository.findById(organisation.id)

      const approvedRegistration = {
        ...inserted.registrations[0],
        status: REG_ACC_STATUS.APPROVED,
        registrationNumber: 'REG12345',
        validFrom: VALID_FROM,
        validTo: VALID_TO,
        reprocessingType: REPROCESSING_TYPE.INPUT,
        accreditationId: inserted.accreditations[0].id
      }

      const approvedAccreditation = {
        ...inserted.accreditations[0],
        status: REG_ACC_STATUS.APPROVED,
        accreditationNumber: 'ACC12345',
        validFrom: VALID_FROM,
        validTo: VALID_TO,
        reprocessingType: REPROCESSING_TYPE.INPUT
      }

      await repository.replace(
        organisation.id,
        1,
        prepareOrgUpdate(inserted, {
          registrations: [approvedRegistration],
          accreditations: [approvedAccreditation]
        })
      )

      const afterApproval = await repository.findById(organisation.id, 2)

      return {
        id: afterApproval.id,
        version: afterApproval.version,
        registrationId: afterApproval.registrations[0].id,
        accreditationId: afterApproval.accreditations[0].id
      }
    }

    it('appends an organisation status entry and bumps the version', async () => {
      const { id, version } = await seedApprovedRegLinkedToApprovedAcc()

      const { organisation: updated, previousStatus } =
        await repository.appendStatusHistory(
          id,
          version,
          { type: 'organisation' },
          ORGANISATION_STATUS.APPROVED
        )

      expect(previousStatus).toBe(ORGANISATION_STATUS.CREATED)
      expect(updated.status).toBe(ORGANISATION_STATUS.APPROVED)
      expect(updated.version).toBe(version + 1)

      const lastEntry = updated.statusHistory.at(-1)
      expect(lastEntry.status).toBe(ORGANISATION_STATUS.APPROVED)
    })

    it('throws conflict (409) on a stale version', async () => {
      const { id } = await seedApprovedRegLinkedToApprovedAcc()

      await expect(
        repository.appendStatusHistory(
          id,
          1,
          { type: 'organisation' },
          ORGANISATION_STATUS.APPROVED
        )
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 }
      })
    })

    it('throws 422 on an invalid organisation transition (created to active)', async () => {
      const organisation = buildOrganisation()
      await repository.insert(organisation)
      const inserted = await repository.findById(organisation.id)

      await expect(
        repository.appendStatusHistory(
          inserted.id,
          inserted.version,
          { type: 'organisation' },
          ORGANISATION_STATUS.ACTIVE
        )
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 422 }
      })
    })

    it('appends a registration status entry', async () => {
      const organisation = buildOrganisation()
      await repository.insert(organisation)
      const inserted = await repository.findById(organisation.id)
      const registrationId = inserted.registrations[0].id

      const { organisation: updated } = await repository.appendStatusHistory(
        inserted.id,
        inserted.version,
        { type: 'registration', registrationId },
        REG_ACC_STATUS.APPROVED
      )

      const registration = updated.registrations.find(
        (r) => r.id === registrationId
      )
      expect(registration.status).toBe(REG_ACC_STATUS.APPROVED)
      expect(updated.version).toBe(inserted.version + 1)
    })

    it('cascades a registration suspend to its linked accreditation', async () => {
      const { id, version, registrationId, accreditationId } =
        await seedApprovedRegLinkedToApprovedAcc()

      const { organisation: updated } = await repository.appendStatusHistory(
        id,
        version,
        { type: 'registration', registrationId },
        REG_ACC_STATUS.SUSPENDED
      )

      const registration = updated.registrations.find(
        (r) => r.id === registrationId
      )
      const accreditation = updated.accreditations.find(
        (a) => a.id === accreditationId
      )

      expect(registration.status).toBe(REG_ACC_STATUS.SUSPENDED)
      expect(accreditation.status).toBe(REG_ACC_STATUS.SUSPENDED)
    })

    it('throws notFound (404) for an unknown organisation id', async () => {
      await expect(
        repository.appendStatusHistory(
          new ObjectId().toString(),
          1,
          { type: 'organisation' },
          ORGANISATION_STATUS.APPROVED
        )
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws notFound (404) for an unknown registration id', async () => {
      const organisation = buildOrganisation()
      await repository.insert(organisation)
      const inserted = await repository.findById(organisation.id)

      await expect(
        repository.appendStatusHistory(
          inserted.id,
          inserted.version,
          { type: 'registration', registrationId: new ObjectId().toString() },
          REG_ACC_STATUS.APPROVED
        )
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })
  })
}
