import {
  buildAccreditation,
  buildOrganisation
} from '#repositories/organisations/contract/test-data.js'
import {
  APPROVED_SITE_ID,
  EXPORTER_NUMBER,
  MISSING_SITE_ID,
  REPROCESSOR_NUMBER,
  accreditation,
  approvedOverseasSite,
  exporter,
  findOrganisation,
  granted,
  overseasSites,
  reprocessor,
  reprocessorAt
} from './organisation-read-test-helpers.js'

/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryWith } from '../port.contract.js' */

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testDroppedRecordsBehaviour = (it) => {
  describe('records the model cannot represent', () => {
    /**
     * @param {OrganisationReadRepositoryWith} organisationReadRepositoryWith
     * @param {{ orgId: number }} stored
     */
    const registrationsOf = async (organisationReadRepositoryWith, stored) => {
      const logger = { warn: vi.fn() }
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites,
        logger
      })
      const organisation = await findOrganisation(repository, stored.orgId)
      return { registrations: organisation.registrations, logger }
    }

    it('leaves out and logs a registration without a number', async ({
      organisationReadRepositoryWith
    }) => {
      const unnumbered = exporter({ registrationNumber: null })
      const { registrations, logger } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({ registrations: [reprocessor(), unnumbered] })
      )

      expect(Object.keys(registrations)).toEqual([REPROCESSOR_NUMBER])
      expect(logger.warn).toHaveBeenCalledWith({
        message: `Registration ${unnumbered.id} has no registration number`
      })
    })

    it('leaves out a registration without validFrom', async ({
      organisationReadRepositoryWith
    }) => {
      const { registrations } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [reprocessor({ validFrom: null })]
        })
      )

      expect(registrations).toEqual({})
    })

    it('leaves out a numbered registration that is not approved or cancelled', async ({
      organisationReadRepositoryWith
    }) => {
      const { registrations } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [
            reprocessor(),
            exporter({ statusHistory: granted('rejected') })
          ]
        })
      )

      expect(Object.keys(registrations)).toEqual([REPROCESSOR_NUMBER])
    })

    it('leaves out and logs a registration without application contact details', async ({
      organisationReadRepositoryWith
    }) => {
      const { registrations, logger } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [
            reprocessor({ applicationContactDetails: undefined }),
            exporter()
          ]
        })
      )

      expect(Object.keys(registrations)).toEqual([EXPORTER_NUMBER])
      expect(logger.warn).toHaveBeenCalledWith({
        message: `Registration ${REPROCESSOR_NUMBER} has no application contact details`
      })
    })

    it('leaves out a reprocessor without a reprocessing type', async ({
      organisationReadRepositoryWith
    }) => {
      const { registrations } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [reprocessor({ reprocessingType: null })]
        })
      )

      expect(registrations).toEqual({})
    })

    it('leaves out a reprocessor whose site address has neither its parts nor the submitted address', async ({
      organisationReadRepositoryWith
    }) => {
      const { registrations } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [reprocessorAt({ line1: '7 Glass site' })]
        })
      )

      expect(registrations).toEqual({})
    })

    it('leaves out and logs every registration that shares its number with another', async ({
      organisationReadRepositoryWith
    }) => {
      const { registrations, logger } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [reprocessor(), reprocessor(), exporter()]
        })
      )

      expect(Object.keys(registrations)).toEqual([EXPORTER_NUMBER])
      expect(logger.warn).toHaveBeenCalledWith({
        message: `Registration number ${REPROCESSOR_NUMBER} is shared by more than one record`
      })
    })

    it('leaves out an accreditation without a number', async ({
      organisationReadRepositoryWith
    }) => {
      const ungranted = buildAccreditation()
      const { registrations } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [reprocessor({ accreditationId: ungranted.id })],
          accreditations: [ungranted]
        })
      )

      expect(registrations[REPROCESSOR_NUMBER].accreditations).toEqual({})
    })

    it('leaves out a numbered accreditation that is not approved, suspended or cancelled', async ({
      organisationReadRepositoryWith
    }) => {
      const rejected = accreditation({ statusHistory: granted('rejected') })
      const { registrations } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [reprocessor({ accreditationId: rejected.id })],
          accreditations: [rejected]
        })
      )

      expect(registrations[REPROCESSOR_NUMBER].accreditations).toEqual({})
    })

    it('leaves out an accreditation without validFrom', async ({
      organisationReadRepositoryWith
    }) => {
      const undated = accreditation({ validFrom: undefined })
      const { registrations } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [reprocessor({ accreditationId: undated.id })],
          accreditations: [undated]
        })
      )

      expect(registrations[REPROCESSOR_NUMBER].accreditations).toEqual({})
    })

    it('leaves out an overseas site whose site record no longer exists', async ({
      organisationReadRepositoryWith
    }) => {
      const { registrations } = await registrationsOf(
        organisationReadRepositoryWith,
        buildOrganisation({
          registrations: [
            exporter({
              overseasSites: {
                '001': { overseasSiteId: APPROVED_SITE_ID },
                '003': { overseasSiteId: MISSING_SITE_ID }
              }
            })
          ]
        })
      )

      expect(registrations[EXPORTER_NUMBER]).toHaveProperty('overseasSites', {
        '001': approvedOverseasSite
      })
    })
  })
}
