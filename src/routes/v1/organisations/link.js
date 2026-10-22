import { SCOPES } from '#auth/constants.js'
import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { ORGANISATION_STATUSES } from '#organisation-read-model/domain/model.js'
import { toLinkedDefraOrganisation } from '#organisation-read-model/repository/adapter.js'
import { linkedDefraOrganisationViewSchema } from '#routes/organisations/response.schema.js'
import { auditOrganisationLinking } from '#root/auditing/organisation-linking.js'
import { organisationLinkingMetrics } from '#common/helpers/metrics/organisation-linking.js'
import { getDefraTokenSummary } from '#auth/roles/helpers.js'

const linkedOrganisationSchema = Joi.object({
  status: Joi.string()
    .valid(...ORGANISATION_STATUSES)
    .required(),
  linkedDefraOrganisation: linkedDefraOrganisationViewSchema.required()
})

/**
 * Links the Defra ID organisation in the user's token to the organisation.
 */
export const organisationsLink = {
  method: 'POST',
  options: {
    auth: {
      scope: [SCOPES.organisationLinkedWrite]
    },
    tags: ['api'],
    response: {
      schema: linkedOrganisationSchema,
      modify: true,
      options: { stripUnknown: true }
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *    organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *    systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository,
   *    app: import('#routes/organisations/at-natural-keys.js').ResolvedRecords,
   *    params: { organisationNumber: import('#domain/organisations/numbers.js').OrganisationNumber }
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { organisation } = request.app
    const {
      decoded: { payload: tokenPayload }
    } = /** @type {import('#common/hapi-types.js').DefraIdArtifacts} */ (
      request.auth.artifacts
    )

    const { defraIdOrgId, defraIdOrgName } = getDefraTokenSummary(tokenPayload)

    if (!defraIdOrgId || !defraIdOrgName) {
      throw Boom.badRequest('Missing organisation information in user token')
    }

    const { email, id: credentialId } =
      /** @type {import('#common/hapi-types.js').HumanCredentials} */ (
        request.auth.credentials
      )

    /**
     * repository only returns linkable orgs where
     * - the org is in an appropriate status (ie approved or active)
     * - the user (identified by email) is an initial user for this org
     * - the organisation is not already linked
     */
    const linkableOrganisations =
      await organisationsRepository.findAllLinkableForUser(tokenPayload.email)

    const orgToLink = linkableOrganisations.find(
      (linkableOrganisation) => linkableOrganisation.id === organisation.id
    )

    if (!orgToLink) {
      // strictly this should 403 if the org is linkable but the user is not an initial user...
      // ...but that differentiation is embedded within findAllLinkableForUser
      throw Boom.conflict('Organisation is not in a linkable state')
    }

    const linkedDefraOrg = {
      orgId: defraIdOrgId,
      orgName: defraIdOrgName,
      linkedBy: {
        email,
        id: credentialId
      },
      linkedAt: new Date().toISOString()
    }

    const { id, version: currentVersion } = organisation

    await organisationsRepository.linkDefraOrganisation(
      request.params.organisationNumber,
      currentVersion,
      linkedDefraOrg
    )

    await auditOrganisationLinking(request, id, {
      id: linkedDefraOrg.orgId,
      name: linkedDefraOrg.orgName
    })
    await organisationLinkingMetrics.organisationLinked()

    const updatedOrganisation = await organisationsRepository.findById(
      id,
      currentVersion + 1
    )

    return h
      .response({
        status: updatedOrganisation.status,
        linkedDefraOrganisation: toLinkedDefraOrganisation(linkedDefraOrg)
      })
      .code(StatusCodes.OK)
  }
}
