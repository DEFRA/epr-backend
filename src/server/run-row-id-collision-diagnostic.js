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

const logAffectedRegistration = async (organisationsRepository, group) => {
  const { organisationId, registrationId } = group._id
  const { collidingRowIds, collidingRecordCount } = group
  const counts = `collidingRowIds=${collidingRowIds} collidingRecordCount=${collidingRecordCount}`
  try {
    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )
    const accreditationNumber =
      registration.accreditation?.accreditationNumber ?? '<none>'
    logger.info({
      message: `Waste-balance row-id collision affected registration: organisationId=${organisationId} registrationNumber=${registration.registrationNumber} accreditationNumber=${accreditationNumber} ${counts}`
    })
  } catch (error) {
    logger.info({
      message: `Waste-balance row-id collision affected registration (lookup failed): organisationId=${organisationId} registrationId=${registrationId} ${counts} lookupError="${error.message}"`
    })
  }
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

  const sample = rolledUp.slice(0, MAX_REGISTRATIONS_LOGGED)

  logger.info({
    message: `Waste-balance row-id collision diagnostic: ${rolledUp.length} affected registrations (logging first ${sample.length} below)`
  })

  await Promise.all(
    sample.map((group) =>
      logAffectedRegistration(organisationsRepository, group)
    )
  )
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
