import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { logger } from '#common/helpers/logging/logger.js'
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

  // Verify the organisation form submission exists
  const orgSubmission = await formSubmissionsRepository.findOrganisationById(id)

  if (!orgSubmission) {
    throw Boom.notFound(`Organisation form submission not found: ${id}`)
  }

  // Find related registrations and accreditations by referenceNumber
  const [registrations, accreditations] = await Promise.all([
    formSubmissionsRepository.findRegistrationsBySystemReference(id),
    formSubmissionsRepository.findAccreditationsBySystemReference(id)
  ])

  logger.info({
    message: `Migrating organisation ${id} with ${registrations.length} registrations and ${accreditations.length} accreditations`
  })

  // Build the migration delta for this specific organisation
  const pendingMigration = {
    organisations: new Set([id]),
    registrations: new Set(registrations.map((r) => r.id)),
    accreditations: new Set(accreditations.map((a) => a.id)),
    totalCount: 1 + registrations.length + accreditations.length
  }

  // Check what's already migrated
  const migratedIds = await organisationsRepository.findAllIds()
  const migrated = {
    organisations: migratedIds.organisations,
    registrations: migratedIds.registrations,
    accreditations: migratedIds.accreditations
  }

  // Use the MigrationOrchestrator to transform and link
  const orchestrator = new MigrationOrchestrator(
    formSubmissionsRepository,
    organisationsRepository
  )

  const organisations = await orchestrator.transformAndLinkAllNewSubmissions(
    migrated,
    pendingMigration
  )

  const migrationItems = orchestrator.prepareMigrationItems(
    organisations,
    pendingMigration
  )

  // Persist the migrated organisation
  const { upsertOrganisations } =
    await import('#formsubmission/migration/organisation-persistence.js')
  await upsertOrganisations(organisationsRepository, migrationItems)

  logger.info({
    message: `Successfully migrated organisation ${id}`
  })

  return h
    .response({
      migrated: {
        organisation: true,
        registrations: registrations.length,
        accreditations: accreditations.length
      }
    })
    .code(StatusCodes.OK)
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
