/**
 * The reported-data comparison core, shared by the resubmission-figures
 * diagnostic and the validation-time resubmission gate.
 *
 * `extractReportedData` picks exactly the reported-data subset a report presents
 * and excludes provenance (`source`), lifecycle metadata (`status`,
 * `resubmissionRequired`), free-text and operator-entered fields
 * (`supportingInformation`, `tonnageRecycled`, `tonnageNotRecycled`,
 * `tonnageReceivedNotExported`, `prn.totalRevenue`, `prn.freeTonnage`) and
 * `prn.averagePricePerTonne` (derived from operator-entered revenue). It also
 * drops each supplier's telephone and email: by agreement (PAE-1983) a change
 * only to a supplier's contact number or address does not require resubmission,
 * even though the report stores them. Missing activity blocks collapse to null
 * so present-vs-absent is itself a difference.
 *
 * `canonicalise` sorts object keys and array elements, so the comparison is
 * insensitive to both key order and row order.
 */

/** @import { RecyclingActivity, ExportActivity, WasteSent } from '#reports/repository/port.js' */

/**
 * A report (or submission) carrying the reported-data activity blocks. `prn`
 * is narrowed to just its issued tonnage so both a frozen report's full PrnData
 * and a freshly generated `{ issuedTonnage }` satisfy it.
 *
 * @typedef {Object} ReportedDataBearingReport
 * @property {RecyclingActivity} [recyclingActivity]
 * @property {ExportActivity} [exportActivity]
 * @property {WasteSent} [wasteSent]
 * @property {{ issuedTonnage: number } | null} [prn]
 */

/**
 * Strips a supplier down to the fields the report compares: its telephone and
 * email are excluded so a contact-only correction does not read as a change.
 *
 * @param {RecyclingActivity['suppliers'][number]} supplier
 */
const dropSupplierContact = ({
  supplierPhone: _supplierPhone,
  supplierEmail: _supplierEmail,
  ...rest
}) => rest

/**
 * The summary-log and PRN activity subset of one report — the reported data it
 * presents, without the free-text and operator-entered fields or supplier
 * contact details.
 *
 * @param {ReportedDataBearingReport} report
 */
export const extractReportedData = (report) => ({
  recyclingActivity: report.recyclingActivity
    ? {
        suppliers: report.recyclingActivity.suppliers.map(dropSupplierContact),
        totalTonnageReceived: report.recyclingActivity.totalTonnageReceived
      }
    : null,
  exportActivity: report.exportActivity
    ? {
        overseasSites: report.exportActivity.overseasSites,
        unapprovedOverseasSites: report.exportActivity.unapprovedOverseasSites,
        totalTonnageExported: report.exportActivity.totalTonnageExported,
        tonnageRefusedAtDestination:
          report.exportActivity.tonnageRefusedAtDestination,
        tonnageStoppedDuringExport:
          report.exportActivity.tonnageStoppedDuringExport,
        totalTonnageRefusedOrStopped:
          report.exportActivity.totalTonnageRefusedOrStopped,
        tonnageRepatriated: report.exportActivity.tonnageRepatriated
      }
    : null,
  wasteSent: report.wasteSent
    ? {
        tonnageSentToReprocessor: report.wasteSent.tonnageSentToReprocessor,
        tonnageSentToExporter: report.wasteSent.tonnageSentToExporter,
        tonnageSentToAnotherSite: report.wasteSent.tonnageSentToAnotherSite,
        finalDestinations: report.wasteSent.finalDestinations
      }
    : null,
  prn: report.prn ? { issuedTonnage: report.prn.issuedTonnage } : null
})

/** @param {string} a @param {string} b */
const byString = (a, b) => a.localeCompare(b)

/**
 * Recursively serialises a value to a stable string with object keys sorted and
 * array elements ordered by their own serialisation, so the result is
 * insensitive to both key order and row order.
 *
 * @param {*} value
 * @returns {string}
 */
export const canonicalise = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).sort(byString).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort(byString)
      .map((key) => `${JSON.stringify(key)}:${canonicalise(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * True when two already-extracted reported-data sets are logically equivalent.
 *
 * @param {ReturnType<typeof extractReportedData>} reportedDataA
 * @param {ReturnType<typeof extractReportedData>} reportedDataB
 */
export const reportedDataAreEquivalent = (reportedDataA, reportedDataB) =>
  canonicalise(reportedDataA) === canonicalise(reportedDataB)
