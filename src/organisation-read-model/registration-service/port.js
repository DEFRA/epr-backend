/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { AccreditationCommon } from '#organisation-read-model/domain/model.js' */

/**
 * @typedef {(message: string) => void} OnDrop
 */

/**
 * A registration's accreditation for a year, held outside the REEX database,
 * in the read model's shape, with the registration and year it is for. It
 * holds no overseas sites: an exporter's are lifted from its registration, as
 * a stored accreditation's are.
 *
 * @typedef {AccreditationCommon & {
 *   organisationNumber: OrganisationNumber
 *   registrationNumber: RegistrationNumber
 *   year: Year
 * }} ExternalAccreditation
 */

/**
 * Loads the external accreditations for a year of the given organisation, or
 * of every organisation when none is given.
 *
 * @typedef {(year: Year, organisationNumber?: OrganisationNumber) => Promise<ExternalAccreditation[]>} ExternalAccreditationsLoader
 */

/**
 * Where external accreditations come from: Reg Accred, or the stand-in
 * collection where Reg Accred is not called. Given a request's logger, it
 * gives the loader for that request.
 *
 * @typedef {(dependencies: { logger: Pick<TypedLogger, 'warn'> }) => ExternalAccreditationsLoader} RegistrationService
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
