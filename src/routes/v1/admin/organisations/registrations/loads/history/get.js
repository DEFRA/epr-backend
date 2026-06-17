import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { rowHistory } from '#waste-balances/application/read-committed-row-states.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { WasteBalanceStreamRepository } from '#waste-balances/repository/stream-port.js' */
/** @import { RowStateRepository } from '#waste-balances/repository/row-states-port.js' */

export const rowHistoryByRegistrationGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}/loads/{wasteRecordType}/{rowId}/history'

export const rowHistoryByAccreditationGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/loads/{wasteRecordType}/{rowId}/history'

const wasteRecordTypeParam = Joi.string()
  .valid(...Object.values(WASTE_RECORD_TYPE))
  .required()

/**
 * @param {Array<import('#waste-balances/application/read-committed-row-states.js').RowHistoryEntry>} history
 */
const toResponse = (history) =>
  history.map((entry) => ({
    summaryLogId: entry.summaryLogId,
    data: entry.data,
    outcome: entry.classification.outcome,
    reasons: entry.classification.reasons,
    transactionAmount: entry.classification.transactionAmount
  }))

/**
 * @param {HapiRequest<unknown> & {
 *   params: {
 *     organisationId: string,
 *     registrationId: string,
 *     wasteRecordType: import('#domain/waste-records/model.js').WasteRecordType,
 *     rowId: string
 *   },
 *   streamRepository: WasteBalanceStreamRepository,
 *   rowStateRepository: RowStateRepository
 * }} request
 * @param {string | null} accreditationId
 */
const readRowHistory = (request, accreditationId) => {
  const { streamRepository, rowStateRepository } = request
  const { organisationId, registrationId, wasteRecordType, rowId } =
    request.params

  return rowHistory({
    streamRepository,
    rowStateRepository,
    organisationId,
    registrationId,
    accreditationId,
    rowId,
    wasteRecordType
  })
}

export const rowHistoryByRegistrationGet = {
  method: 'GET',
  path: rowHistoryByRegistrationGetPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required(),
        wasteRecordType: wasteRecordTypeParam,
        rowId: Joi.string().required()
      })
    }
  },
  /**
   * @param {HapiRequest<unknown> & {
   *   params: {
   *     organisationId: string,
   *     registrationId: string,
   *     wasteRecordType: import('#domain/waste-records/model.js').WasteRecordType,
   *     rowId: string
   *   },
   *   streamRepository: WasteBalanceStreamRepository,
   *   rowStateRepository: RowStateRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const history = await readRowHistory(request, null)
    return h.response(toResponse(history)).code(StatusCodes.OK)
  }
}

export const rowHistoryByAccreditationGet = {
  method: 'GET',
  path: rowHistoryByAccreditationGetPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required(),
        accreditationId: Joi.string().required(),
        wasteRecordType: wasteRecordTypeParam,
        rowId: Joi.string().required()
      })
    }
  },
  /**
   * @param {HapiRequest<unknown> & {
   *   params: {
   *     organisationId: string,
   *     registrationId: string,
   *     accreditationId: string,
   *     wasteRecordType: import('#domain/waste-records/model.js').WasteRecordType,
   *     rowId: string
   *   },
   *   streamRepository: WasteBalanceStreamRepository,
   *   rowStateRepository: RowStateRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const history = await readRowHistory(
      request,
      request.params.accreditationId
    )
    return h.response(toResponse(history)).code(StatusCodes.OK)
  }
}
