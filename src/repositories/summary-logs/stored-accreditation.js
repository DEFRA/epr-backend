/** @import { SummaryLogAccreditation } from '#domain/summary-logs/model.js' */
/** @import { StoredSummaryLog } from './port.js' */

/**
 * @param {string} id
 * @param {Pick<StoredSummaryLog, 'accreditationNumber'>} stored
 * @returns {SummaryLogAccreditation}
 */
const accreditationOf = (id, { accreditationNumber }) => {
  if (
    accreditationNumber === null ||
    (typeof accreditationNumber === 'string' && accreditationNumber)
  ) {
    return { accreditationNumber }
  }
  throw new TypeError(
    `Summary log ${id} is stored with an accreditation in no shape a summary log can take: accreditationNumber ${accreditationNumber}`
  )
}

/**
 * Reads a stored summary log as the domain declares it, by its numbers alone,
 * dropping any database ids an older one holds.
 *
 * @template {StoredSummaryLog} T
 * @param {string} id
 * @param {T} stored
 * @returns {Omit<T, 'organisationId' | 'registrationId' | 'accreditationId' | 'accreditationNumber'> & SummaryLogAccreditation}
 */
export const readStoredSummaryLog = (id, stored) => {
  const {
    organisationId: _organisationId,
    registrationId: _registrationId,
    accreditationId: _id,
    accreditationNumber: _number,
    ...summaryLog
  } = stored
  return { ...summaryLog, ...accreditationOf(id, stored) }
}
