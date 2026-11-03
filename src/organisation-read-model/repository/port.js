/** @import { Organisation, Registration } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationNumber, RegistrationNumber, AccreditationNumber } from '#domain/organisations/numbers.js' */

/**
 * Every criterion that carries a value narrows the results, and an empty
 * string counts as absent.
 *
 * @typedef {{
 *   search?: string
 *   organisationNumber?: string
 *   registrationNumber?: string
 *   accreditationNumber?: string
 *   page: number
 *   pageSize: number
 * }} FindParams
 */

/**
 * @typedef {{
 *   items: Organisation[]
 *   page: number
 *   pageSize: number
 *   totalItems: number
 *   totalPages: number
 * }} OrganisationPage
 */

/**
 * @typedef {Object} OrganisationReadRepository
 * @property {(organisationNumber: OrganisationNumber, minimumVersion?: number) => Promise<Organisation | null>} findByOrganisationNumber - With `minimumVersion`, waits for that version of the stored organisation to be readable, and throws 500 if it never is
 * @property {(params: FindParams) => Promise<OrganisationPage>} find - Organisations matching every criterion, sorted by name, a page at a time
 * @property {() => Promise<Organisation[]>} findAll
 * @property {(organisationNumber: OrganisationNumber, registrationNumber: RegistrationNumber) => Promise<{ organisation: Organisation, registration: Registration } | null>} findRegistrationByNumber - Null when the organisation, or a registration with that number, is not in the read model
 * @property {(organisationNumber: OrganisationNumber, registrationNumber: RegistrationNumber, accreditationNumber: AccreditationNumber) => Promise<{ organisation: Organisation, registration: Registration, accreditation: Registration['accreditations'][string], year: string } | null>} findAccreditationByNumber - Null unless the registration has an accreditation with that number in the read model, which leaves out accreditations it drops
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
