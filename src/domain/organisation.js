const CREATED = 'created'
const APPROVED = 'approved'
const REJECTED = 'rejected'
const SUSPENDED = 'suspended'
const ARCHIVED = 'archived'

export const ORGANISATION_STATUS = Object.freeze({
  CREATED,
  APPROVED,
  REJECTED,
  SUSPENDED,
  ARCHIVED
})

export const WASTE_PROCESSING_TYPES = Object.freeze({
  EXPORTER: 'exporter',
  REPROCESSOR: 'reprocessor'
})

export const NATION = Object.freeze({
  ENGLAND: 'england',
  SCOTLAND: 'scotland',
  WALES: 'wales',
  NORTHERN_IRELAND: 'northern_ireland'
})

export { CREATED, APPROVED, REJECTED, SUSPENDED, ARCHIVED }

const VALID_TRANSITIONS = {
  [ORGANISATION_STATUS.CREATED]: [
    ORGANISATION_STATUS.APPROVED,
    ORGANISATION_STATUS.REJECTED,
    ORGANISATION_STATUS.SUSPENDED,
    ORGANISATION_STATUS.ARCHIVED
  ],
  [ORGANISATION_STATUS.APPROVED]: [
    ORGANISATION_STATUS.SUSPENDED,
    ORGANISATION_STATUS.ARCHIVED
  ],
  [ORGANISATION_STATUS.SUSPENDED]: [
    ORGANISATION_STATUS.APPROVED,
    ORGANISATION_STATUS.ARCHIVED
  ],
  [ORGANISATION_STATUS.REJECTED]: [ORGANISATION_STATUS.ARCHIVED]
}

export const isValidTransition = (fromStatus, toStatus) => {
  if (!fromStatus) {
    return true
  }

  const allowedTransitions = VALID_TRANSITIONS[fromStatus]
  return allowedTransitions ? allowedTransitions.includes(toStatus) : false
}
