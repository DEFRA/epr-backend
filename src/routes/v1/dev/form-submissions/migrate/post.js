import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { MigrationOrchestrator } from '#formsubmission/migration/migration-orchestrator.js'

/** @import {HapiRequest} from '#common/hapi-types.js' */
/** @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * @typedef {HapiRequest & {
 *   formSubmissionsRepository: FormSubmissionsRepository
 *   organisationsRepository: OrganisationsRepository
 *   params: { id: string }
 * }} MigrateRequest
 */

export const devFormSubmissionsMigratePath =
  '/v1/dev/form-submissions/{id}/migrate'

const params = Joi.object({
  id: Joi.string().trim().min(1).required()
}).messages({
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.min': '{#label} cannot be empty'
})

/**
 * Migrate a single organisation by ID.
 *
 * @param {MigrateRequest} request
 * @param {Object} h - Hapi response toolkit
 */
async function handler(request, h) {
  const { formSubmissionsRepository, organisationsRepository } = request
  const { id } = request.params

  const orchestrator = new MigrationOrchestrator(
    formSubmissionsRepository,
    organisationsRepository
  )

  const result = await orchestrator.migrateById(id)

  if (!result) {
    throw Boom.notFound(`Organisation form submission not found: ${id}`)
  }

  return h.response({ migrated: result }).code(StatusCodes.OK)
}

export const devFormSubmissionsMigratePost = {
  method: 'POST',
  path: devFormSubmissionsMigratePath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      params
    }
  },
  handler
}
