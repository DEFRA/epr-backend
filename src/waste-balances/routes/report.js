import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { generateWasteBalanceReport } from '../application/waste-balance-report.js'
import { wasteBalanceReportResponseSchema } from './report.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const wasteBalanceReportPath = '/v1/admin/waste-balances/report'

/**
 * Admin report of every live accreditation's waste balance as it stood at a
 * cutoff instant, with per-material totals across reprocessors and across
 * exporters. The endpoint is not month-aware: the cutoff is an arbitrary
 * instant, and month semantics live with the caller (the admin frontend).
 */
export const wasteBalanceReportGet = {
  method: 'GET',
  path: wasteBalanceReportPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    validate: {
      query: Joi.object({
        cutoff: Joi.date().iso().required()
      })
    },
    response: {
      schema: wasteBalanceReportResponseSchema
    }
  },
  /**
   * @param {HapiRequest & { query: { cutoff: Date } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { cutoff } = request.query

    const report = await generateWasteBalanceReport(
      {
        organisationsRepository: request.organisationsRepository,
        ledgerRepository: request.ledgerRepository
      },
      cutoff
    )

    return h
      .response({ cutoff: cutoff.toISOString(), ...report })
      .code(StatusCodes.OK)
  }
}
