import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'
import crypto from 'node:crypto'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { PRN_STATUS } from '#domain/packaging-recycling-notes/status.js'

/** @typedef {import('#repositories/packaging-recycling-notes/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const prnPostPath =
  '/v1/organisations/{organisationId}/accreditations/{accreditationId}/prns'
export const issuerNotesMaxLen = 200
export const prnPost = {
  method: 'POST',
  path: prnPostPath,
  options: {
    auth: {
      scope: [ROLES.standardUser]
    },
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().uuid().required(),
        accreditationId: Joi.string().uuid().required()
      }),
      payload: Joi.object({
        tonnage: Joi.number().integer().positive().required(),
        issuerNotes: Joi.string().max(issuerNotesMaxLen).required(),
        issuedToOrganisation: Joi.object({
          id: Joi.string().uuid().required(),
          name: Joi.string().required(),
          tradingName: Joi.string().optional()
        }).required()
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository, organisationsRepository: OrganisationsRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (
    {
      packagingRecyclingNotesRepository,
      organisationsRepository,
      params,
      payload
    },
    h
  ) => {
    const { organisationId, accreditationId } = params
    const { tonnage, issuerNotes, issuedToOrganisation } =
      /** @type {import('#domain/packaging-recycling-notes/model.js').CreateNewPRNRequest} */ (
        payload
      )

    const organisation = await organisationsRepository.findById(organisationId)
    const registration = organisation.registrations?.find(
      (r) => r.accreditationId === accreditationId
    )

    if (!registration) {
      throw Boom.notFound(
        `No registration found for accreditation ${accreditationId}`
      )
    }

    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    // TODO: populate from auth credentials once name is available request.auth.credentials.profile

    const createdBy = {
      id: h.request.auth.credentials.profile.id,
      name: h.request.auth.credentials.profile.name
    }

    /** @type {import('#domain/packaging-recycling-notes/model.js').PackagingRecyclingNote} */
    const prn = {
      id,
      organisationId,
      registrationId: registration.id,
      accreditationId,
      schemaVersion: 1,
      createdAt,
      createdBy,
      isExport:
        registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER,
      isDecemberWaste: false,
      prnNumber: '',
      accreditationYear: 2026, // hardcoded to 2026 for now
      tonnage,
      issuerNotes,
      issuedToOrganisation,
      status: [
        {
          status: PRN_STATUS.DRAFT,
          createdAt,
          createdBy
        }
      ]
    }

    await packagingRecyclingNotesRepository.insert(id, prn)

    return h.response({ id, ...prn }).code(StatusCodes.CREATED)
  }
}
