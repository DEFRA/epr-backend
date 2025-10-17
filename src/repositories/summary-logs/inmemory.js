import Boom from '@hapi/boom'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  validateId,
  validateSummaryLogInsert,
  validateSummaryLogUpdate
} from './validation.js'

/**
 * @returns {import('./port.js').SummaryLogsRepositoryFactory}
 */
export const createInMemorySummaryLogsRepository = () => {
  const storage = new Map()

  return (logger) => ({
    async insert(summaryLog) {
      const validated = validateSummaryLogInsert(summaryLog)

      if (storage.has(validated.id)) {
        throw Boom.conflict(
          `Summary log with id ${validated.id} already exists`
        )
      }

      storage.set(validated.id, structuredClone({ ...validated, version: 1 }))
    },

    async update(id, version, updates) {
      const validatedId = validateId(id)
      const validatedUpdates = validateSummaryLogUpdate(updates)

      const existing = storage.get(validatedId)

      if (!existing) {
        throw Boom.notFound(`Summary log with id ${validatedId} not found`)
      }

      if (existing.version !== version) {
        const conflictError = new Error(
          `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
        )

        logger.error({
          error: conflictError,
          message: `Version conflict detected for summary log ${validatedId}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.DB,
            action: LOGGING_EVENT_ACTIONS.VERSION_CONFLICT_DETECTED,
            reference: validatedId
          }
        })

        throw Boom.conflict(conflictError.message)
      }

      storage.set(
        validatedId,
        structuredClone({
          ...existing,
          ...validatedUpdates,
          version: existing.version + 1
        })
      )
    },

    async findById(id) {
      const validatedId = validateId(id)
      const result = storage.get(validatedId)
      return result ? structuredClone(result) : null
    }
  })
}
