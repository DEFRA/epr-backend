import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

const WASTE_RECORDS_COLLECTION = 'waste-records'
const LOCK_NAME = 'row-id-collision-diagnostic'
const MAX_REGISTRATIONS_LOGGED = 100

export const ROW_ID_COLLISION_PIPELINE = [
  {
    $group: {
      _id: {
        organisationId: '$organisationId',
        registrationId: '$registrationId',
        rowId: '$rowId'
      },
      types: { $addToSet: '$type' },
      docCount: { $sum: 1 }
    }
  },
  { $match: { 'types.1': { $exists: true } } },
  {
    $group: {
      _id: {
        organisationId: '$_id.organisationId',
        registrationId: '$_id.registrationId'
      },
      collidingRowIds: { $sum: 1 },
      collidingRecordCount: { $sum: '$docCount' }
    }
  },
  { $sort: { '_id.organisationId': 1, '_id.registrationId': 1 } }
]

/**
 * @typedef {Object} RowIdCollisionGroup
 * @property {{organisationId: string, registrationId: string}} _id
 * @property {number} collidingRowIds - Number of distinct rowIds that collide across types within this registration
 * @property {number} collidingRecordCount - Total waste-record documents involved in collisions (sum across the registration's colliding rowIds)
 */

/**
 * Runs the collision aggregation against the waste-records collection and
 * returns the rolled-up affected registrations in sort order.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<RowIdCollisionGroup[]>}
 */
export const findRowIdCollisions = async (db) => {
  const rolledUp = await db
    .collection(WASTE_RECORDS_COLLECTION)
    .aggregate(ROW_ID_COLLISION_PIPELINE, { allowDiskUse: true })
    .toArray()
  return /** @type {RowIdCollisionGroup[]} */ (rolledUp)
}

const resolveRegistrationNumbers = async (organisationsRepository, group) => {
  const { organisationId, registrationId } = group._id
  const { collidingRowIds, collidingRecordCount } = group
  try {
    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )
    return {
      organisationId,
      registrationNumber: registration.registrationNumber,
      accreditationNumber:
        registration.accreditation?.accreditationNumber ?? null,
      collidingRowIds,
      collidingRecordCount
    }
  } catch (error) {
    return {
      organisationId,
      registrationNumber: null,
      accreditationNumber: null,
      collidingRowIds,
      collidingRecordCount,
      lookupError: error.message
    }
  }
}

/**
 * @param {{organisationId: string, registrationNumber: string|null|undefined, accreditationNumber: string|null, collidingRowIds: number, collidingRecordCount: number, lookupError?: string}} entry
 */
const formatAffectedRegistration = ({
  organisationId,
  registrationNumber,
  accreditationNumber,
  collidingRowIds,
  collidingRecordCount,
  lookupError
}) => {
  const base = `organisationId=${organisationId} registrationNumber=${registrationNumber ?? '<unknown>'} accreditationNumber=${accreditationNumber ?? '<none>'} collidingRowIds=${collidingRowIds} collidingRecordCount=${collidingRecordCount}`
  return lookupError ? `${base} lookupError="${lookupError}"` : base
}

const runDiagnostic = async (server) => {
  logger.info({
    message: 'Running waste-balance row-id collision diagnostic'
  })

  const rolledUp = await findRowIdCollisions(server.db)

  if (rolledUp.length === 0) {
    logger.info({
      message:
        'Waste-balance row-id collision diagnostic: 0 affected registrations'
    })
    return
  }

  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const sample = await Promise.all(
    rolledUp
      .slice(0, MAX_REGISTRATIONS_LOGGED)
      .map((group) =>
        resolveRegistrationNumbers(organisationsRepository, group)
      )
  )

  logger.info({
    message: `Waste-balance row-id collision diagnostic: ${rolledUp.length} affected registrations (logging first ${sample.length} below)`
  })

  for (const entry of sample) {
    logger.info({
      message: `Waste-balance row-id collision affected registration: ${formatAffectedRegistration(entry)}`
    })
  }
}

/**
 * One-shot startup diagnostic for PAE-1364: scopes the production impact of the
 * waste-balance calculator's naked-rowId keying bug by finding registrations
 * whose waste-records collection has the same rowId under more than one type.
 *
 * Runs under a cross-instance lock so only one pod per deploy executes the scan.
 *
 * @param {Object} server - Hapi server instance
 */
export const runRowIdCollisionDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping row-id collision diagnostic'
      })
      return
    }
    try {
      await runDiagnostic(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run row-id collision diagnostic'
    })
  }
}
