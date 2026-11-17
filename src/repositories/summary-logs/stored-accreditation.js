/** @import { SummaryLogAccreditation } from '#domain/summary-logs/model.js' */
/** @import { StoredSummaryLog } from './port.js' */

/**
 * An older summary log holds an accreditation id exactly when it holds a number.
 *
 * @param {Pick<StoredSummaryLog, 'accreditationId' | 'accreditationNumber'>} stored
 */
const idMatchesNumber = ({ accreditationId, accreditationNumber }) =>
  accreditationId === undefined ||
  (accreditationId === null) === (accreditationNumber === null)

/**
 * @param {string} id
 * @param {Pick<StoredSummaryLog, 'accreditationId' | 'accreditationNumber'>} stored
 * @returns {SummaryLogAccreditation}
 */
const accreditationOf = (id, stored) => {
  const { accreditationId, accreditationNumber } = stored
  if (
    (accreditationNumber === null ||
      (typeof accreditationNumber === 'string' && accreditationNumber)) &&
    idMatchesNumber(stored)
  ) {
    return { accreditationNumber }
  }
  throw new TypeError(
    `Summary log ${id} is stored with an accreditation in no shape a summary log can take: accreditationId ${accreditationId}, accreditationNumber ${accreditationNumber}`
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
