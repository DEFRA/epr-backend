import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { ObjectId } from 'mongodb'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'

/** @import { OrganisationBuilders } from '#repositories/organisations/contract/test-data.js' */

/**
 * The status-history fixtures, built with the caller's builders so they draw
 * organisation numbers from the same sequence as its other organisations.
 *
 * @param {Pick<OrganisationBuilders, 'buildOrganisation'>} builders
 */
export const createStatusHistoryBuilders = ({ buildOrganisation }) => {
  /**
   * Builds an organisation with a target registration whose statusHistory ends
   * in the given status, plus an unrelated second (exporter) registration used
   * to assert that changing the target's status leaves other registrations
   * untouched. A created registration has no number or validFrom yet.
   * @param {string} status
   * @param {{ registrationOverrides?: object }} [options]
   */
  const buildOrgWithRegistrationStatus = (
    status,
    { registrationOverrides = {} } = {}
  ) => {
    const registration = buildRegistration({
      reprocessingType: 'input',
      statusHistory:
        status === 'created'
          ? [{ status: 'created', updatedAt: '2024-01-01' }]
          : [
              { status: 'created', updatedAt: '2024-01-01' },
              { status, updatedAt: '2024-02-01' }
            ],
      ...(status !== 'created' && {
        registrationNumber: 'REG123456',
        validFrom: '2024-01-01'
      }),
      ...registrationOverrides
    })
    const otherRegistration = buildRegistration({
      wasteProcessingType: 'exporter'
    })

    return /** @type {import('#domain/organisations/model.js').Organisation} */ (
      /** @type {unknown} */ (
        buildOrganisation({
          registrations: [registration, otherRegistration],
          accreditations: []
        })
      )
    )
  }

  /**
   * Builds an organisation with a registration linked to a target
   * accreditation whose statusHistory ends in the given status, plus an
   * unrelated second (unlinked, 'created') accreditation used to assert that
   * changing the target's status leaves other accreditations untouched.
   * The linked registration is 'created' by default; approving the
   * accreditation requires an approved registration, so tests opt in via
   * registrationStatus ('approved', 'rejected' or 'cancelled').
   * accreditationOverrides lets grant tests shape the target accreditation
   * (e.g. no number yet).
   * @param {string} status
   * @param {{ registrationStatus?: string, accreditationOverrides?: object }} [options]
   */
  const buildOrgWithAccreditationStatus = (
    status,
    { registrationStatus = 'created', accreditationOverrides = {} } = {}
  ) => {
    const accreditationId = new ObjectId().toString()
    const registration = buildRegistration({
      accreditationId,
      reprocessingType: 'input',
      ...(registrationStatus !== 'created' && {
        // registrationNumber/validFrom are only required once a
        // registration has been approved, but non-created registrations get
        // them for realism (mirrors buildOrgWithRegistrationStatus).
        registrationNumber: 'REG123456',
        validFrom: '2024-01-01',
        statusHistory: [
          { status: 'created', updatedAt: '2024-01-01' },
          { status: registrationStatus, updatedAt: '2024-01-15' }
        ]
      })
    })
    const accreditation = buildAccreditation({
      id: accreditationId,
      wasteProcessingType: registration.wasteProcessingType,
      // validFrom/validTo/accreditationNumber/reprocessingType are only
      // required once an accreditation has been approved or suspended.
      validFrom: '2024-01-01',
      validTo: '2025-01-01',
      accreditationNumber: toAccreditationNumber('ACC123456'),
      reprocessingType: 'input',
      statusHistory:
        /** @type {import('#domain/organisations/accreditation.js').StatusHistoryEntry[]} */ (
          status === 'created'
            ? [{ status: 'created', updatedAt: '2024-01-01' }]
            : [
                { status: 'created', updatedAt: '2024-01-01' },
                { status, updatedAt: '2024-02-01' }
              ]
        ),
      ...accreditationOverrides
    })
    const otherAccreditation = buildAccreditation()

    return /** @type {import('#domain/organisations/model.js').Organisation} */ (
      /** @type {unknown} */ (
        buildOrganisation({
          registrations: [registration],
          accreditations: [accreditation, otherAccreditation]
        })
      )
    )
  }

  return { buildOrgWithRegistrationStatus, buildOrgWithAccreditationStatus }
}
