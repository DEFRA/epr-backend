import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { getProcessCode } from '#packaging-recycling-notes/domain/get-process-code.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { packagingRecyclingNotesCreatePayloadSchema } from './post.schema.js'

/** @typedef {import('#common/helpers/waste-organisations/api-adapter.js').WasteOrganisationsService} WasteOrganisationsService */
/** @typedef {import('#packaging-recycling-notes/domain/model.js').CreatePrnResponse} CreatePrnResponse */
/** @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/**
 * @typedef {{
 *   issuedToOrganisation: { id: string };
 *   tonnage: number;
 *   notes?: string;
 * }} PackagingRecyclingNotesCreatePayload
 */

export const packagingRecyclingNotesCreatePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes'

const snapshotAccreditation = (accreditation) => {
  const snapshot = {
    id: accreditation.id,
    accreditationNumber: accreditation.accreditationNumber,
    accreditationYear: deriveAccreditationYear(accreditation),
    material: accreditation.material,
    submittedToRegulator: accreditation.submittedToRegulator
  }

  if (
    accreditation.material === 'glass' &&
    accreditation.glassRecyclingProcess?.[0]
  ) {
    snapshot.glassRecyclingProcess = accreditation.glassRecyclingProcess[0]
  }

  if (accreditation.site?.address) {
    snapshot.siteAddress = accreditation.site.address
  }

  return snapshot
}

const snapshotUser = (auth) => ({
  id: auth.credentials?.id ?? 'unknown',
  name: auth.credentials?.name ?? 'unknown'
})

const snapshotOrganisation = (org, organisationId) => ({
  id: organisationId,
  name: org.companyDetails.name,
  ...(org.companyDetails.tradingName && {
    tradingName: org.companyDetails.tradingName
  })
})

const snapshotIssuedToOrganisation = (resolvedOrg) => ({
  id: resolvedOrg.id,
  name: resolvedOrg.name,
  ...(resolvedOrg.tradingName && {
    tradingName: resolvedOrg.tradingName
  }),
  ...(resolvedOrg.registrationType && {
    registrationType: resolvedOrg.registrationType
  })
})

const buildPrnData = ({
  organisation,
  registrationId,
  accreditation,
  issuedToOrganisation,
  payload,
  user,
  isExport,
  now
}) => ({
  schemaVersion: 2,
  organisation,
  registrationId,
  accreditation: snapshotAccreditation(accreditation),
  issuedToOrganisation,
  tonnage: payload.tonnage,
  isExport,
  ...(payload.notes && { notes: payload.notes }),
  isDecemberWaste: false,
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    currentStatusAt: now,
    history: [{ status: PRN_STATUS.DRAFT, at: now, by: user }]
  },
  createdAt: now,
  createdBy: user,
  updatedAt: now,
  updatedBy: user
})

/**
 * @param {{ id: string; validFrom?: string }} accreditation
 * @returns {number}
 * @throws {Error} if validFrom is missing — approved accreditations must have it
 */
const deriveAccreditationYear = (accreditation) => {
  if (!accreditation.validFrom) {
    throw new Error(
      `Accreditation ${accreditation.id} is missing validFrom — cannot derive accreditation year`
    )
  }
  return new Date(accreditation.validFrom).getFullYear()
}

const logAndThrowServerError = (error, logger) => {
  if (error.isBoom) {
    throw error
  }

  logger.error({
    err: error,
    message: `Failure on ${packagingRecyclingNotesCreatePath}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
    },
    http: {
      response: {
        status_code: StatusCodes.INTERNAL_SERVER_ERROR
      }
    }
  })

  throw Boom.badImplementation(
    `Failure on ${packagingRecyclingNotesCreatePath}`
  )
}

/**
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {{ wasteProcessingType: string }} accreditation
 * @returns {CreatePrnResponse}
 */
const buildResponse = (prn, { wasteProcessingType }) => ({
  id: prn.id,
  accreditationYear: prn.accreditation.accreditationYear,
  createdAt: prn.createdAt,
  isDecemberWaste: prn.isDecemberWaste,
  issuedToOrganisation: prn.issuedToOrganisation,
  material: prn.accreditation.material,
  notes: prn.notes ?? null,
  processToBeUsed: /** @type {string} */ (
    getProcessCode(prn.accreditation.material)
  ),
  status: prn.status.currentStatus,
  tonnage: prn.tonnage,
  wasteProcessingType
})

export const packagingRecyclingNotesCreate = {
  method: 'POST',
  path: packagingRecyclingNotesCreatePath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api'],
    validate: {
      payload: packagingRecyclingNotesCreatePayloadSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<PackagingRecyclingNotesCreatePayload> & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository, organisationsRepository: OrganisationsRepository, wasteOrganisationsService: WasteOrganisationsService}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      packagingRecyclingNotesRepository,
      organisationsRepository,
      wasteOrganisationsService,
      params,
      payload,
      logger /** @type {import('#common/hapi-types.js').TypedLogger} */,
      auth
    } = request
    const { organisationId, registrationId, accreditationId } = params
    const user = snapshotUser(auth)
    const now = new Date()

    try {
      const [accreditation, org, resolvedIssuedToOrg] = await Promise.all([
        organisationsRepository.findAccreditationById(
          organisationId,
          accreditationId
        ),
        organisationsRepository.findById(organisationId),
        wasteOrganisationsService.getOrganisationById(
          payload.issuedToOrganisation.id
        )
      ])
      if (!resolvedIssuedToOrg) {
        throw Boom.badData(
          `Organisation ${payload.issuedToOrganisation.id} not found in waste organisations API`
        )
      }

      const isExport =
        accreditation.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER

      const organisation = snapshotOrganisation(org, organisationId)
      const issuedToOrganisation =
        snapshotIssuedToOrganisation(resolvedIssuedToOrg)

      const prnData = buildPrnData({
        organisation,
        registrationId,
        accreditation,
        issuedToOrganisation,
        payload,
        user,
        isExport,
        now
      })
      const prn = await packagingRecyclingNotesRepository.create(prnData)

      logger.info({
        message: `PRN created: id=${prn.id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: prn.id
        }
      })

      return h
        .response(buildResponse(prn, accreditation))
        .code(StatusCodes.CREATED)
    } catch (error) {
      logAndThrowServerError(error, logger)
    }
  }
}
