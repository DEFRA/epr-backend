/**
 * Organisation Read Model Module
 *
 * Looks up the organisations and registrations the read model serves.
 *
 * @module organisation-read-model
 */

export {
  findOrganisationAndRegistrationReadModels,
  findOrganisationReadModel
} from './find-by-natural-keys.js'
export { servesOrganisationOn } from './repository/to-read-model.js'
