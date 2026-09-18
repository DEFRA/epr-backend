import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  abandonedBuildCutoff,
  MARKET_INSIGHTS_EXPORT_STATUS,
  marketInsightsExportFileName
} from '#market-insights/domain/export.js'
import { COMMAND_TIMEOUT_MS } from '#server/queue-consumer/command-timeout.js'
import {
  monthlyPeriodParamsSchema,
  publishedMonthsThrough
} from './published-months.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { MarketInsightsExport, MarketInsightsExportsRepository } from '#market-insights/exports/repository/port.js' */
/** @import { MarketInsightsExportStore } from '#market-insights/exports/store/port.js' */
/** @import { MarketInsightsExportsCommandExecutor } from '#market-insights/exports/worker/port.js' */

export const marketInsightsExportPath =
  '/v1/market-insights/{year}/{cadence}/{period}/export'

const responseSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(MARKET_INSIGHTS_EXPORT_STATUS))
    .required(),
  buildToken: Joi.string(),
  downloadUrl: Joi.string(),
  expiresAt: Joi.string(),
  failureReason: Joi.string()
})

/**
 * What the build a caller is waiting on has come to.
 *
 * @param {MarketInsightsExport} record
 * @param {MarketInsightsExportStore} store
 */
const outcomeOf = async (record, store) => {
  if (record.status === MARKET_INSIGHTS_EXPORT_STATUS.FAILED) {
    return { status: record.status, failureReason: record.failureReason }
  }

  if (record.status !== MARKET_INSIGHTS_EXPORT_STATUS.READY) {
    return { status: record.status, buildToken: record.buildToken }
  }

  // The object sits under a prefix it shares the bucket by; what a regulator
  // saves is the name alone.
  const { url, expiresAt } = await store.signDownload({
    key: /** @type {string} */ (record.s3Key),
    fileName: marketInsightsExportFileName({
      year: record.year,
      cadence: record.cadence,
      period: record.period,
      generatedAt: /** @type {string} */ (record.generatedAt)
    })
  })

  return { status: record.status, downloadUrl: url, expiresAt }
}

export const marketInsightsExportGet = {
  method: 'GET',
  path: marketInsightsExportPath,
  options: {
    auth: {
      scope: [SCOPES.marketDataRead]
    },
    tags: ['api', 'market-insights'],
    validate: {
      params: monthlyPeriodParamsSchema,
      query: Joi.object({ build: Joi.string() })
    },
    response: {
      schema: responseSchema
    }
  },
  /**
   * Build this period's export, or report the build already being waited on.
   *
   * A request naming no build takes a fresh snapshot: nothing here serves an
   * export taken earlier. The one thing it will not do is start a second build
   * beside one already running, because the wait page's meta refresh would
   * otherwise start one on every poll.
   *
   * A request naming the build it is waiting on is answered with that build's
   * outcome, which is what lets a poller follow its own snapshot through to the
   * download instead of watching the period restart under it. A token the
   * period has moved on from is answered with the build that took over, so a
   * poller is handed the newer snapshot rather than a dead end.
   *
   * No figure work happens here. Building inside the request is what
   * `POST /v1/public-register/generate` does, and what this deliberately does
   * not.
   *
   * @param {HapiRequest & {
   *   params: { year: number, cadence: 'monthly', period: number },
   *   query: { build?: string },
   *   marketInsightsExportsRepository: MarketInsightsExportsRepository,
   *   marketInsightsExportStore: MarketInsightsExportStore,
   *   marketInsightsExportsWorker: MarketInsightsExportsCommandExecutor
   * }} request
   * @param {HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (request, h) => {
    const {
      marketInsightsExportsRepository,
      marketInsightsExportStore,
      marketInsightsExportsWorker,
      logger,
      params,
      query
    } = request

    const now = new Date()
    const months = publishedMonthsThrough(params, now, 'market_insights_export')
    const { year, cadence, period } = params

    const waitingOn = await marketInsightsExportsRepository.findForPeriod({
      year,
      cadence,
      period
    })

    if (waitingOn !== null && waitingOn.buildToken === query.build) {
      return h
        .response(await outcomeOf(waitingOn, marketInsightsExportStore))
        .code(StatusCodes.OK)
    }

    // Claiming is one write in the store, so requests arriving together settle
    // on one build rather than starting several.
    const { record, claimed } =
      await marketInsightsExportsRepository.claimForBuild({
        year,
        cadence,
        period,
        now,
        abandonedBefore: abandonedBuildCutoff(COMMAND_TIMEOUT_MS, now)
      })

    if (claimed) {
      await marketInsightsExportsWorker.requestExport({
        exportId: record.id,
        buildToken: record.buildToken,
        year,
        cadence,
        period,
        months
      })

      logger.info({
        message: `Market insights export build requested: id=${record.id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: record.id
        }
      })
    }

    return h
      .response({
        status: MARKET_INSIGHTS_EXPORT_STATUS.BUILDING,
        buildToken: record.buildToken
      })
      .code(StatusCodes.OK)
  }
}
