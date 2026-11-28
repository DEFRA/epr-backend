/** @import { ExternalAccreditation } from '#organisation-read-model/domain/model.js' */

/**
 * @typedef {{
 *   upsert: (accreditation: ExternalAccreditation) => Promise<ExternalAccreditation>
 * }} ExternalAccreditationsRepository
 */

/**
 * @typedef {() => ExternalAccreditationsRepository} ExternalAccreditationsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
