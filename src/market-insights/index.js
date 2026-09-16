/**
 * Market Insights
 *
 * The publication the four regulators are under a statutory duty to produce:
 * the aggregated, anonymised UK view of accredited reprocessor and exporter
 * activity that GOV.UK carries. It renders figures the rest of the service
 * already computes rather than computing its own.
 *
 * @module market-insights
 */

export { marketInsightsWasteBalanceGet } from './routes/waste-balance-get.js'
export {
  marketInsightsEnglandReprocessorExporterFiguresGet,
  marketInsightsReprocessorExporterFiguresGet
} from './routes/reprocessor-exporter-figures-get.js'
export { marketInsightsOutstandingReturnsGet } from './routes/outstanding-returns-get.js'
