import { SCOPES } from '#auth/constants.js'
import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { ORGANISATION_STATUSES } from '#organisation-read-model/domain/model.js'
import { linkedDefraOrganisationViewSchema } from '#routes/organisations/response.schema.js'
import { auditOrganisationLinking } from '#root/auditing/organisation-linking.js'
import { organisationLinkingMetrics } from '#common/helpers/metrics/organisation-linking.js'
import { getDefraTokenSummary } from '#auth/roles/helpers.js'

/** @import { StoredLinkedDefraOrganisation } from '#domain/organisations/model.js' */
/** @import { ResolvedRecords, ResolvedRequest } from '#routes/organisations/at-natural-keys.js' */

const linkedOrganisationSchema = Joi.object({
  status: Joi.string()
    .valid(...ORGANISATION_STATUSES)
    .required(),
  linkedDefraOrganisation: linkedDefraOrganisationViewSchema.required()
})

/**
 * @param {StoredLinkedDefraOrganisation} linked
 */
const toLinkedDefraOrganisationView = (linked) => ({
  defraOrganisation: { id: linked.orgId, name: linked.orgName },
  linkedAt: new Date(linked.linkedAt).toISOString(),
  linkedBy: { email: linked.linkedBy.email }
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
   * @param {ResolvedRequest & { app: ResolvedRecords }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { organisationId, organisationNumber } = request.params
    const { version: currentVersion } = request.app.storedOrganisation
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
      (linkableOrganisation) => linkableOrganisation.id === organisationId
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

    await organisationsRepository.linkDefraOrganisation(
      organisationNumber,
      currentVersion,
      linkedDefraOrg
    )

    await auditOrganisationLinking(request, organisationId, {
      id: linkedDefraOrg.orgId,
      name: linkedDefraOrg.orgName
    })
    await organisationLinkingMetrics.organisationLinked()

    const updatedOrganisation =
      await organisationsRepository.findByOrganisationNumber(
        organisationNumber,
        currentVersion + 1
      )
    if (!updatedOrganisation?.linkedDefraOrganisation) {
      throw Boom.internal('Linked organisation could not be read back')
    }

    return h
      .response({
        status: updatedOrganisation.status,
        linkedDefraOrganisation: toLinkedDefraOrganisationView(
          updatedOrganisation.linkedDefraOrganisation
        )
      })
      .code(StatusCodes.OK)
  }
}
