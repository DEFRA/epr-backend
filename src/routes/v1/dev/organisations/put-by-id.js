import {
  makePutOrganisationHandler,
  validateMyPayload
} from '#routes/v1/organisations/put-by-id.js'

// Non-prod seeding twin of PUT /v1/organisations/{id} (registered only when
// dev endpoints are enabled). Journey-test fixtures seed registration and
// accreditation statuses and numbers through it — the public route rejects
// status changes (PAE-1645) and the transition endpoints enforce number
// uniqueness, both of which test seeding must bypass. Repository-level
// validation (schemas, transition table, cascade) still applies.
export const devOrganisationsPutByIdPath = '/v1/dev/organisations/{id}'

export const devOrganisationsPutById = {
  method: 'PUT',
  path: devOrganisationsPutByIdPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      payload: validateMyPayload
    }
  },

  handler: makePutOrganisationHandler({ devSeeding: true })
}
