import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { removeUndefinedValues } from '#formsubmission/parsing-common/transform-utils.js'

/**
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 * @import {OrganisationMigrationItem} from '#formsubmission/types.js'
 */

function isSuccessResult(result) {
  return result.success === true
}

function partitionResults(results) {
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .reduce(
      (acc, result) => {
        const target = isSuccessResult(result) ? acc.successful : acc.failed
        target.push(result)
        return acc
      },
      { successful: [], failed: [] }
    )
}

function insertOrganisation(organisationsRepository, item) {
  return organisationsRepository
    .insert(removeUndefinedValues(item.value))
    .then(
      () =>
        /** @type {import('#formsubmission/types.js').SuccessResult} */ ({
          success: true,
          id: item.value.id,
          action: 'inserted'
        })
    )
    .catch((error) => {
      logger.error({
        err: error,
        message: 'Error inserting organisation',
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
          reference: item.value.id
        }
      })
      return /** @type {import('#formsubmission/types.js').FailureResult} */ ({
        success: false,
        id: item.value.id,
        phase: 'insert'
      })
    })
}

function updateOrganisation(organisationsRepository, item) {
  const { id, version, ...orgWithoutIdAndVersion } = /** @type {any} */ (
    item.value
  )
  return organisationsRepository
    .replace(id, version, removeUndefinedValues(orgWithoutIdAndVersion))
    .then(
      () =>
        /** @type {import('#formsubmission/types.js').SuccessResult} */ ({
          success: true,
          id,
          action: 'updated'
        })
    )
    .catch((error) => {
      logger.error({
        err: error,
        message: 'Error updating organisation',
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
          reference: id
        }
      })
      return /** @type {import('#formsubmission/types.js').FailureResult} */ ({
        success: false,
        id,
        phase: 'update'
      })
    })
}

/**
 * @param {OrganisationsRepository} organisationsRepository
 * @param {OrganisationMigrationItem[]} organisations
 * @returns {Promise<void>}
 */
export async function upsertOrganisations(
  organisationsRepository,
  organisations
) {
  const toInsert = organisations.filter((item) => item.operation === 'insert')
  const toUpdate = organisations.filter((item) => item.operation === 'update')

  const insertPromises = toInsert.map((item) =>
    insertOrganisation(organisationsRepository, item)
  )
  const updatePromises = toUpdate.map((item) =>
    updateOrganisation(organisationsRepository, item)
  )

  const results = await Promise.allSettled([
    ...insertPromises,
    ...updatePromises
  ])
  const { successful, failed } = partitionResults(results)

  const insertedCount = successful.filter((r) => r.action === 'inserted').length
  const updatedCount = successful.filter((r) => r.action === 'updated').length

  logger.info({
    message: `Persisted transformed submissions: ${successful.length}/${organisations.length} organisations processed (${insertedCount} inserted, ${updatedCount} updated, ${failed.length} failed)`
  })
}
