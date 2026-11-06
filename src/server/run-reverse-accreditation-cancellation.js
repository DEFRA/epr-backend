import { isDeepStrictEqual } from 'node:util'

import { logger } from '#common/helpers/logging/logger.js'
import { auditReverseAccreditationCancellation } from '#auditing/reverse-accreditation-cancellation.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

const LOCK_NAME = 'reverse-accreditation-cancellation'
const ORGANISATION_NUMBER = toOrganisationNumber('500064')
const ACCREDITATION_NUMBER = 'A26EX5000640122PL'
const REASON = 'Court order reversing the cancellation of 19/10/2026'
const ENTRIES_TO_REMOVE = [
  { status: 'suspended', updatedAt: '2026-10-19T10:37:26.074Z' },
  { status: 'cancelled', updatedAt: '2026-10-19T10:37:32.973Z' }
]

/**
 * @param {Accreditation} accreditation
 * @returns {boolean}
 */
const endsWithEntriesToRemove = ({ statusHistory }) =>
  isDeepStrictEqual(
    statusHistory
      .slice(-ENTRIES_TO_REMOVE.length)
      .map(({ status, updatedAt }) => ({
        status,
        updatedAt: new Date(updatedAt).toISOString()
      })),
    ENTRIES_TO_REMOVE
  )

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

  const organisation =
    await organisationsRepository.findByOrganisationNumber(ORGANISATION_NUMBER)
  const accreditation = organisation?.accreditations.find(
    ({ accreditationNumber }) => accreditationNumber === ACCREDITATION_NUMBER
  )

  if (
    !organisation ||
    !accreditation ||
    !endsWithEntriesToRemove(accreditation)
  ) {
    logger.info({
      message: `Skipping accreditation cancellation reversal: accreditationNumber=${ACCREDITATION_NUMBER} not found or already reversed`
    })
    return
  }

  const { id, version, ...orgFields } = organisation

  // The status is passed unchanged so replace() keeps the supplied history
  // rather than appending a transition.
  await organisationsRepository.replace(id, version, {
    ...orgFields,
    accreditations: organisation.accreditations.map((acc) =>
      acc.id === accreditation.id
        ? {
            ...acc,
            statusHistory: acc.statusHistory.slice(0, -ENTRIES_TO_REMOVE.length)
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
 * returning it to approved. Once they are gone it does nothing.
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
