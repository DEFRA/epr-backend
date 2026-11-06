import { logger } from '#common/helpers/logging/logger.js'
import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { auditReverseAccreditationCancellation } from '#auditing/reverse-accreditation-cancellation.js'
import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

const LOCK_NAME = 'reverse-accreditation-cancellation'
const ORGANISATION_NUMBER = toOrganisationNumber('500064')
const ACCREDITATION_NUMBER = 'A26EX5000640122PL'
const REVERSED_DATE = '2026-10-19'
const REASON = 'Court order reversing the cancellation of 19/10/2026'
const REMOVED_STATUSES = [
  ACCREDITATION_STATUS.SUSPENDED,
  ACCREDITATION_STATUS.CANCELLED
]
const EXPECTED_TAIL = [ACCREDITATION_STATUS.APPROVED, ...REMOVED_STATUSES]

/**
 * @param {Date | string} updatedAt
 * @returns {string} YYYY-MM-DD in UK time
 */
const ukDateOf = (updatedAt) =>
  new Date(updatedAt).toLocaleDateString('en-CA', { timeZone: UK_TIME_ZONE })

/**
 * @param {Accreditation} accreditation
 * @returns {boolean}
 */
const historyEndsInReversibleCancellation = ({ statusHistory }) => {
  const tail = statusHistory.slice(-EXPECTED_TAIL.length)
  return (
    tail.length === EXPECTED_TAIL.length &&
    tail.every(({ status }, index) => status === EXPECTED_TAIL[index]) &&
    tail
      .slice(1)
      .every(({ updatedAt }) => ukDateOf(updatedAt) === REVERSED_DATE)
  )
}

/**
 * @param {Organisation | null} organisation
 * @returns {{ organisation: Organisation, accreditation: Accreditation } | { skipReason: string }}
 */
const findTarget = (organisation) => {
  if (!organisation) {
    return { skipReason: 'organisation not found' }
  }

  const accreditation = organisation.accreditations.find(
    ({ accreditationNumber }) => accreditationNumber === ACCREDITATION_NUMBER
  )
  if (!accreditation) {
    return { skipReason: 'accreditation not found on organisation' }
  }

  if (!historyEndsInReversibleCancellation(accreditation)) {
    return {
      skipReason: `status history does not end approved, suspended, cancelled with the last two on ${REVERSED_DATE}`
    }
  }

  if (!accreditation.validFrom || !accreditation.validTo) {
    return { skipReason: 'accreditation has no validity window' }
  }

  const registration = organisation.registrations.find(
    ({ accreditationId }) => accreditationId === accreditation.id
  )
  if (registration?.status !== REGISTRATION_STATUS.APPROVED) {
    return { skipReason: 'linked registration is not approved' }
  }

  return { organisation, accreditation }
}

/**
 * @param {StartedServer} server
 */
const reverseCancellation = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()
  const systemLogsRepository = (await createSystemLogsRepository(server.db))(
    logger
  )

  const target = findTarget(
    await organisationsRepository.findByOrganisationNumber(ORGANISATION_NUMBER)
  )
  if ('skipReason' in target) {
    logger.info({
      message: `Skipping accreditation cancellation reversal: organisationNumber=${ORGANISATION_NUMBER} accreditationNumber=${ACCREDITATION_NUMBER} reason="${target.skipReason}"`
    })
    return
  }

  const { organisation, accreditation } = target
  const { id, version, ...orgFields } = organisation

  // The status is passed unchanged so replace() keeps the supplied history
  // rather than appending a transition.
  await organisationsRepository.replace(id, version, {
    ...orgFields,
    accreditations: organisation.accreditations.map((acc) =>
      acc.id === accreditation.id
        ? {
            ...acc,
            statusHistory: acc.statusHistory.slice(0, -REMOVED_STATUSES.length)
          }
        : acc
    )
  })
  const updated = await organisationsRepository.findById(id, version + 1)

  await auditReverseAccreditationCancellation(systemLogsRepository, {
    organisationId: id,
    accreditationId: accreditation.id,
    reason: REASON,
    previous: organisation,
    next: updated
  })

  logger.info({
    message: `Reversed accreditation cancellation: organisationId=${id} accreditationId=${accreditation.id} accreditationNumber=${ACCREDITATION_NUMBER}`
  })
}

/**
 * One-off startup migration (PAE-2223): removes the suspended and cancelled
 * status history entries of 19/10/2026 from accreditation A26EX5000640122PL,
 * returning it to approved. Does nothing unless the history matches exactly,
 * so it is safe to run on every start until removed.
 *
 * @param {StartedServer} server
 */
export const runReverseAccreditationCancellation = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping accreditation cancellation reversal'
      })
      return
    }
    try {
      await reverseCancellation(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to reverse accreditation cancellation'
    })
  }
}
