/** @import { SummaryLogAccreditation } from '#domain/summary-logs/model.js' */
/** @import { StoredSummaryLog } from './port.js' */

/**
 * @param {string} id
 * @param {Pick<StoredSummaryLog, 'accreditationId' | 'accreditationNumber'>} stored
 * @returns {SummaryLogAccreditation}
 */
const accreditationOf = (id, { accreditationId, accreditationNumber }) => {
  if (typeof accreditationId === 'string' && accreditationNumber) {
    return { accreditationNumber }
  }
  if (accreditationId === null && accreditationNumber === null) {
    return { accreditationNumber }
  }
  throw new TypeError(
    `Summary log ${id} is stored with an accreditation in no shape a summary log can take: accreditationId ${accreditationId}, accreditationNumber ${accreditationNumber}`
  )
}

/**
 * Reads a stored summary log as the domain declares it, naming its
 * accreditation by number alone.
 *
 * @template {StoredSummaryLog} T
 * @param {string} id
 * @param {T} stored
 * @returns {Omit<T, 'accreditationId' | 'accreditationNumber'> & SummaryLogAccreditation}
 */
export const readStoredSummaryLog = (id, stored) => {
  const {
    accreditationId: _id,
    accreditationNumber: _number,
    ...summaryLog
  } = stored
  return { ...summaryLog, ...accreditationOf(id, stored) }
}
