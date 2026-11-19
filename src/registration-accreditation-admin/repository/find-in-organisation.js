import Boom from '@hapi/boom'

/** @import { RegistrationAccreditationAdminRepository } from './port.js' */

/**
 * @param {RegistrationAccreditationAdminRepository['findById']} findById
 * @returns {RegistrationAccreditationAdminRepository['findRegistrationById']}
 */
export const performFindRegistrationById =
  (findById) => async (organisationId, registrationId, minimumOrgVersion) => {
    const org = await findById(organisationId, minimumOrgVersion)
    const registration = org.registrations?.find((r) => r.id === registrationId)

    if (!registration) {
      throw Boom.notFound(`Registration with id ${registrationId} not found`)
    }

    const accreditation =
      registration.accreditationId &&
      org.accreditations?.find((a) => a.id === registration.accreditationId)

    return accreditation ? { ...registration, accreditation } : registration
  }

/**
 * @param {RegistrationAccreditationAdminRepository['findById']} findById
 * @returns {RegistrationAccreditationAdminRepository['findAccreditationById']}
 */
export const performFindAccreditationById =
  (findById) => async (organisationId, accreditationId, minimumOrgVersion) => {
    const org = await findById(organisationId, minimumOrgVersion)
    const accreditation = org.accreditations?.find(
      (a) => a.id === accreditationId
    )

    if (!accreditation) {
      throw Boom.notFound(`Accreditation with id ${accreditationId} not found`)
    }

    return accreditation
  }
