/** @import {OrganisationAdministrationRepository} from './administration-port.js' */
/** @import {OrganisationLinkingRepository} from './linking-port.js' */

/**
 * The store behind both organisation ports. Only the adapters and their
 * plugins see it whole.
 *
 * @typedef {OrganisationAdministrationRepository & OrganisationLinkingRepository} OrganisationsRepository
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
