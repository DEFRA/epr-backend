import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REG_ACC_STATUS,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration,
  getValidDateRange,
  prepareOrgUpdate
} from './test-data.js'

export const testAccreditationLinkValidation = (it) => {
  describe('accreditation link validation', () => {
    let repository
    const { VALID_FROM, VALID_TO } = getValidDateRange()

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import('../port.js').OrganisationsRepositoryFactory }} */ {
          organisationsRepository
        }
      ) => {
        repository = await organisationsRepository()
      }
    )

    describe('validateAccreditationLinkUniqueness', () => {
      it('rejects linking two registrations to the same accreditation regardless of status', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)

        const accreditationId = organisation.accreditations[0].id
        const updatePayload = prepareOrgUpdate(organisation, {
          registrations: [
            {
              ...organisation.registrations[0],
              status: REG_ACC_STATUS.CREATED,
              accreditationId
            },
            {
              ...organisation.registrations[1],
              status: REG_ACC_STATUS.APPROVED,
              registrationNumber: 'REG123',
              validFrom: VALID_FROM,
              validTo: VALID_TO,
              accreditationId
            }
          ]
        })

        await expect(
          repository.replace(organisation.id, 1, updatePayload)
        ).rejects.toThrow(
          /Each accreditation must be linked to at most one registration/
        )
      })
    })

    describe('validateAccreditationLinkExists', () => {
      it('rejects when a registration links to a non-existent accreditation', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        const nonExistentId = new ObjectId().toString()
        const registrationToUpdate = {
          ...inserted.registrations[0],
          accreditationId: nonExistentId
        }

        await expect(
          repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [registrationToUpdate]
            })
          )
        ).rejects.toThrow(
          `Registrations are linked to accreditations that do not exist: registration ${registrationToUpdate.id} -> accreditation ${nonExistentId}`
        )
      })

      it('accepts when a registration links to an existing accreditation', async () => {
        const organisation = buildOrganisation()
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        const registrationToUpdate = {
          ...inserted.registrations[0],
          accreditationId: inserted.accreditations[0].id
        }

        await expect(
          repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [registrationToUpdate]
            })
          )
        ).resolves.not.toThrow()
      })

      it('accepts when a registration has no accreditationId', async () => {
        const reg = buildRegistration()
        const organisation = buildOrganisation({ registrations: [reg] })
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        await expect(
          repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [{ ...inserted.registrations[0] }]
            })
          )
        ).resolves.not.toThrow()
      })
    })

    describe('validateAccreditationLinkMatches', () => {
      it('rejects when a registration links to an accreditation with a different material', async () => {
        const accId = new ObjectId().toString()
        const organisation = buildOrganisation({
          registrations: [
            buildRegistration({
              wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
              material: MATERIAL.PAPER,
              accreditationId: accId
            })
          ],
          accreditations: [
            buildAccreditation({
              id: accId,
              wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
              material: MATERIAL.ALUMINIUM,
              glassRecyclingProcess: null,
              site: undefined,
              orsFileUploads: [
                {
                  defraFormUploadedFileId: 'file-ors',
                  defraFormUserDownloadLink: 'https://example.com/ors'
                }
              ]
            })
          ]
        })
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        await expect(
          repository.replace(organisation.id, 1, prepareOrgUpdate(inserted, {}))
        ).rejects.toThrow(
          /Registrations are linked to accreditations that do not match their type, material, or site/
        )
      })

      it('rejects when a registration links to an accreditation with a different wasteProcessingType', async () => {
        const accId = new ObjectId().toString()
        const organisation = buildOrganisation({
          registrations: [
            buildRegistration({
              wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
              material: MATERIAL.PAPER,
              accreditationId: accId
            })
          ],
          accreditations: [
            buildAccreditation({
              id: accId,
              wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
              material: MATERIAL.PAPER,
              glassRecyclingProcess: null
            })
          ]
        })
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        await expect(
          repository.replace(organisation.id, 1, prepareOrgUpdate(inserted, {}))
        ).rejects.toThrow(
          /Registrations are linked to accreditations that do not match their type, material, or site/
        )
      })

      it('rejects when registration has reprocessingType but linked accreditation does not', async () => {
        const accId = new ObjectId().toString()
        const organisation = buildOrganisation({
          registrations: [buildRegistration({ accreditationId: accId })],
          accreditations: [buildAccreditation({ id: accId })]
        })
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        await expect(
          repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [
                {
                  ...inserted.registrations[0],
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            })
          )
        ).rejects.toThrow(
          /Registrations are linked to accreditations that do not match their type, material, or site/
        )
      })

      it('accepts when both registration and accreditation have matching reprocessingType', async () => {
        const accId = new ObjectId().toString()
        const organisation = buildOrganisation({
          registrations: [buildRegistration({ accreditationId: accId })],
          accreditations: [buildAccreditation({ id: accId })]
        })
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        await expect(
          repository.replace(
            organisation.id,
            1,
            prepareOrgUpdate(inserted, {
              registrations: [
                {
                  ...inserted.registrations[0],
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
          )
        ).resolves.not.toThrow()
      })

      it('accepts when neither registration nor accreditation has reprocessingType', async () => {
        const accId = new ObjectId().toString()
        const organisation = buildOrganisation({
          registrations: [buildRegistration({ accreditationId: accId })],
          accreditations: [buildAccreditation({ id: accId })]
        })
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        await expect(
          repository.replace(organisation.id, 1, prepareOrgUpdate(inserted, {}))
        ).resolves.not.toThrow()
      })

      it('rejects when registration and accreditation have different glassRecyclingProcess', async () => {
        const accId = new ObjectId().toString()
        const organisation = buildOrganisation({
          registrations: [
            buildRegistration({
              wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
              material: MATERIAL.GLASS,
              glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
              accreditationId: accId
            })
          ],
          accreditations: [
            buildAccreditation({
              id: accId,
              wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
              material: MATERIAL.GLASS,
              glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER],
              site: undefined,
              orsFileUploads: [
                {
                  defraFormUploadedFileId: 'file-ors',
                  defraFormUserDownloadLink: 'https://example.com/ors'
                }
              ]
            })
          ]
        })
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        await expect(
          repository.replace(organisation.id, 1, prepareOrgUpdate(inserted, {}))
        ).rejects.toThrow(
          /Registrations are linked to accreditations that do not match their type, material, or site/
        )
      })

      it('accepts when registration and accreditation have matching glassRecyclingProcess', async () => {
        const accId = new ObjectId().toString()
        const organisation = buildOrganisation({
          registrations: [
            buildRegistration({
              wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
              material: MATERIAL.GLASS,
              glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
              accreditationId: accId
            })
          ],
          accreditations: [
            buildAccreditation({
              id: accId,
              wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
              material: MATERIAL.GLASS,
              glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
              site: undefined,
              orsFileUploads: [
                {
                  defraFormUploadedFileId: 'file-ors',
                  defraFormUserDownloadLink: 'https://example.com/ors'
                }
              ]
            })
          ]
        })
        await repository.insert(organisation)
        const inserted = await repository.findById(organisation.id)

        await expect(
          repository.replace(organisation.id, 1, prepareOrgUpdate(inserted, {}))
        ).resolves.not.toThrow()
      })
    })
  })
}
