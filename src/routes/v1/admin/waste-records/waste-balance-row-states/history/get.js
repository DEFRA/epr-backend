import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { rowHistory } from '#waste-balances/application/read-committed-row-states.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { WasteBalanceStreamRepository } from '#waste-balances/repository/stream-port.js' */
/** @import { RowStateRepository } from '#waste-balances/repository/row-states-port.js' */

export const rowHistoryGetPath =
  '/v1/admin/waste-records/{organisationId}/{registrationId}/waste-balance-row-states/{rowId}/history'

export const rowHistoryGet = {
  method: 'GET',
  path: rowHistoryGetPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required(),
        rowId: Joi.string().required()
      }),
      query: Joi.object({
        type: Joi.string()
          .valid(...Object.values(WASTE_RECORD_TYPE))
          .required()
      })
    }
  },
  /**
   * @param {HapiRequest<unknown> & {
   *   params: { organisationId: string, registrationId: string, rowId: string },
   *   query: { type: import('#domain/waste-records/model.js').WasteRecordType },
   *   streamRepository: WasteBalanceStreamRepository,
   *   rowStateRepository: RowStateRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { streamRepository, rowStateRepository } = request
    const { organisationId, registrationId, rowId } = request.params
    const { type } = request.query

    const history = await rowHistory({
      streamRepository,
      rowStateRepository,
      organisationId,
      registrationId,
      rowId,
      wasteRecordType: type
    })

    const response = history.map((entry) => ({
      summaryLogId: entry.summaryLogId,
      data: entry.data,
      outcome: entry.classification.outcome,
      reasons: entry.classification.reasons,
      transactionAmount: entry.classification.transactionAmount
    }))

    return h.response(response).code(StatusCodes.OK)
  }
}
