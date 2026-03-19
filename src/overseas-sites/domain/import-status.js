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
