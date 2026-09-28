import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createOnSummaryLogUploaded } from '#reports/application/summary-log-events.js'
import { createReportsService } from '#reports/application/report-service.js'

/** @import { ServerApp } from '#common/hapi-types.js' */
/** @import { SummaryLogHandlerDeps } from './summary-log-commands.js' */

/**
 * @typedef {Pick<ServerApp,
 *   | 'uploadsRepository'
 *   | 'summaryLogsRepository'
 *   | 'organisationsRepository'
 *   | 'summaryLogRowStatesRepository'
 *   | 'ledgerRepository'
 *   | 'wasteBalanceService'
 *   | 'reportsRepository'
 *   | 'systemLogsRepository'
 *   | 'overseasSitesRepository'
 * >} SummaryLogHandlerSources
 */

/**
 * Builds the dependencies the summary log command handlers run against, from
 * wherever the registered dependencies are read: `server.app` for the queue
 * consumer, or a request for a route that runs the handlers in-process.
 *
 * @param {SummaryLogHandlerSources} sources
 * @returns {Omit<SummaryLogHandlerDeps, 'logger'>}
 */
export const buildSummaryLogHandlerDeps = ({
  uploadsRepository,
  summaryLogsRepository,
  organisationsRepository,
  summaryLogRowStatesRepository,
  ledgerRepository,
  wasteBalanceService,
  reportsRepository,
  systemLogsRepository,
  overseasSitesRepository
}) => ({
  summaryLogsRepository,
  organisationsRepository,
  summaryLogRowStatesRepository,
  ledgerRepository,
  wasteBalanceService,
  overseasSitesRepository,
  reportsService: createReportsService(reportsRepository),
  summaryLogExtractor: createSummaryLogExtractor({ uploadsRepository }),
  onSummaryLogUploaded: createOnSummaryLogUploaded({
    reportsRepository,
    systemLogsRepository
  })
})
