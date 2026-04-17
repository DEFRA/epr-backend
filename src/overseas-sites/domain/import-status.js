export const ORS_IMPORT_STATUS = Object.freeze({
  PREPROCESSING: 'preprocessing',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
})

export const ORS_FILE_RESULT_STATUS = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure'
})

export const ORS_IMPORT_COMMAND = Object.freeze({
  IMPORT_OVERSEAS_SITES: 'import-overseas-sites'
})

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

const STATUS_TO_TTL = {
  [ORS_IMPORT_STATUS.PREPROCESSING]: MILLISECONDS_PER_DAY,
  [ORS_IMPORT_STATUS.PROCESSING]: MILLISECONDS_PER_DAY,
  [ORS_IMPORT_STATUS.FAILED]: MILLISECONDS_PER_DAY,
  [ORS_IMPORT_STATUS.COMPLETED]: null
}

const VALID_ORS_IMPORT_TRANSITIONS = Object.freeze({
  [ORS_IMPORT_STATUS.PREPROCESSING]: Object.freeze([
    ORS_IMPORT_STATUS.PROCESSING,
    ORS_IMPORT_STATUS.FAILED
  ]),
  [ORS_IMPORT_STATUS.PROCESSING]: Object.freeze([
    ORS_IMPORT_STATUS.COMPLETED,
    ORS_IMPORT_STATUS.FAILED
  ]),
  [ORS_IMPORT_STATUS.COMPLETED]: Object.freeze([]),
  [ORS_IMPORT_STATUS.FAILED]: Object.freeze([])
})

/**
 * @param {string} status
 * @returns {Date|null}
 */
export const calculateOrsImportExpiresAt = (status) => {
  if (!(status in STATUS_TO_TTL)) {
    throw new Error(`Unknown ORS import status for TTL calculation: ${status}`)
  }

  const ttl = STATUS_TO_TTL[status]
  if (ttl === null) {
    return null
  }

  return new Date(Date.now() + ttl)
}

/**
 * A terminal status is one from which no further transitions are allowed.
 * Writes to an import already in a terminal status are silently dropped by the
 * repository to keep at-least-once SQS delivery idempotent.
 *
 * @param {string} status
 * @returns {boolean}
 */
export const isOrsImportStatusTerminal = (status) =>
  VALID_ORS_IMPORT_TRANSITIONS[status]?.length === 0

/**
 * Concrete list of terminal statuses for use as a MongoDB `$nin` filter value.
 * Kept in sync with `isOrsImportStatusTerminal` by derivation.
 */
export const ORS_IMPORT_TERMINAL_STATUSES = Object.freeze(
  Object.values(ORS_IMPORT_STATUS).filter(isOrsImportStatusTerminal)
)
