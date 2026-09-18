import Joi from 'joi'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { buildMarketInsightsExportArchive } from '#market-insights/application/build-export-archive.js'
import {
  MARKET_INSIGHTS_COMMAND,
  marketInsightsExportObjectKey
} from '#market-insights/domain/export.js'

/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {MarketInsightsExportsRepository} from '#market-insights/exports/repository/port.js' */
/** @import {MarketInsightsExportStore} from '#market-insights/exports/store/port.js' */
/** @import {MarketInsightsExportCommand} from '#market-insights/exports/worker/port.js' */
/** @import {CommandHandler} from './summary-log-commands.js' */

/**
 * @typedef {object} MarketInsightsExportHandlerDeps
 * @property {TypedLogger} logger
 * @property {MarketInsightsExportsRepository} marketInsightsExportsRepository
 * @property {MarketInsightsExportStore} marketInsightsExportStore
 * @property {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @property {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @property {import('#overseas-sites/repository/port.js').OverseasSitesRepository} overseasSitesRepository
 * @property {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 */

const FAILURE_REASON = 'The export could not be built'

/**
 * @param {TypedLogger} logger
 * @param {string} exportId
 */
const logOvertaken = (logger, exportId) => {
  logger.info({
    message: `Market insights export ${exportId} has been claimed by a later build; discarding this one's result`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS,
      reference: exportId
    }
  })
}

/** @type {CommandHandler} */
export const marketInsightsExportHandler = {
  command: MARKET_INSIGHTS_COMMAND.EXPORT,
  payloadSchema: Joi.object({
    exportId: Joi.string().required(),
    buildToken: Joi.string().required(),
    year: Joi.number().required(),
    cadence: Joi.string().required(),
    period: Joi.number().required(),
    months: Joi.array().items(Joi.string()).min(1).required()
  }),

  execute: async (
    /** @type {MarketInsightsExportCommand} */ payload,
    /** @type {MarketInsightsExportHandlerDeps} */ deps
  ) => {
    const { exportId, buildToken, year, cadence, period } = payload

    const now = new Date()
    const { body, generatedAt } = await buildMarketInsightsExportArchive({
      ledgerRepository: deps.ledgerRepository,
      summaryLogRowStatesRepository: deps.summaryLogRowStatesRepository,
      organisationsRepository: deps.organisationsRepository,
      overseasSitesRepository: deps.overseasSitesRepository,
      reportsRepository: deps.reportsRepository,
      logger: deps.logger,
      year,
      cadence,
      period,
      months: payload.months.map(toYearMonth),
      now
    })

    // A new object per build: whoever is reading the last one keeps reading it.
    const s3Key = marketInsightsExportObjectKey({
      year,
      cadence,
      period,
      generatedAt
    })
    await deps.marketInsightsExportStore.save({ key: s3Key, body })

    const recorded = await deps.marketInsightsExportsRepository.markReady({
      id: exportId,
      buildToken,
      generatedAt,
      s3Key,
      now: new Date()
    })

    if (!recorded) {
      logOvertaken(deps.logger, exportId)
    }
  },

  onFailure: async (
    /** @type {MarketInsightsExportCommand} */ payload,
    /** @type {MarketInsightsExportHandlerDeps} */ deps
  ) => {
    try {
      await deps.marketInsightsExportsRepository.markFailed({
        id: payload.exportId,
        buildToken: payload.buildToken,
        failureReason: FAILURE_REASON,
        now: new Date()
      })
    } catch (err) {
      deps.logger.error({
        err,
        message: `Failed to mark market insights export ${payload.exportId} as failed`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
        }
      })
    }
  },

  describe: (/** @type {MarketInsightsExportCommand} */ payload) =>
    `exportId=${payload.exportId}`
}

/** @type {CommandHandler[]} */
export const marketInsightsExportCommandHandlers = [marketInsightsExportHandler]
