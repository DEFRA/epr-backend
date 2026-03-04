import Joi from 'joi'

import { SUMMARY_LOG_COMMAND } from '#domain/summary-logs/status.js'
import {
  markAsValidationFailed,
  markAsSubmissionFailed
} from '#domain/summary-logs/mark-as-failed.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'

/** @typedef {import('#common/helpers/logging/logger.js').TypedLogger} TypedLogger */
/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/waste-records/port.js').WasteRecordsRepository} WasteRecordsRepository */
/** @typedef {import('#repositories/waste-balances/port.js').WasteBalancesRepository} WasteBalancesRepository */
/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} SummaryLogExtractor */

/**
 * @typedef {object} SummaryLogHandlerDeps
 * @property {TypedLogger} logger
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {WasteRecordsRepository} wasteRecordsRepository
 * @property {WasteBalancesRepository} wasteBalancesRepository
 * @property {SummaryLogExtractor} summaryLogExtractor
 */

const userSchema = Joi.object({
  id: Joi.string().required(),
  email: Joi.string().required(),
  scope: Joi.array().items(Joi.string()).required()
})

/**
 * Generic command handler interface. The consumer passes its full deps bag
 * through to execute/onFailure — each handler narrows to its own deps type
 * via inline type annotations on the deps parameter.
 *
 * @typedef {object} CommandHandler
 * @property {string} command - The command string (e.g. 'validate', 'submit')
 * @property {import('joi').ObjectSchema} payloadSchema - Validates everything except 'command'
 * @property {(payload: object, deps: object) => Promise<void>} execute - Runs the command
 * @property {(payload: object, deps: object) => Promise<void>} onFailure - Marks as failed on terminal error
 * @property {(payload: object) => string} describe - Returns logging context
 */

/**
 * Creates summary log command handlers.
 *
 * Wrapped in a factory so the plugin can construct handlers at
 * initialisation time rather than importing a static array.
 *
 * @returns {CommandHandler[]}
 */
export const createSummaryLogCommandHandlers = () => [
  {
    command: SUMMARY_LOG_COMMAND.VALIDATE,
    payloadSchema: Joi.object({
      summaryLogId: Joi.string().required()
    }),
    execute: async (payload, /** @type {SummaryLogHandlerDeps} */ deps) => {
      const {
        summaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      } = deps

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      })

      await validateSummaryLog(payload.summaryLogId)
    },
    onFailure: async (payload, /** @type {SummaryLogHandlerDeps} */ deps) => {
      await markAsValidationFailed(
        payload.summaryLogId,
        deps.summaryLogsRepository,
        deps.logger
      )
    },
    describe: (payload) => `summaryLogId=${payload.summaryLogId}`
  },
  {
    command: SUMMARY_LOG_COMMAND.SUBMIT,
    payloadSchema: Joi.object({
      summaryLogId: Joi.string().required(),
      user: userSchema.optional()
    }),
    execute: async (payload, /** @type {SummaryLogHandlerDeps} */ deps) => {
      await submitSummaryLog(payload.summaryLogId, {
        ...deps,
        user: payload.user
      })
    },
    onFailure: async (payload, /** @type {SummaryLogHandlerDeps} */ deps) => {
      await markAsSubmissionFailed(
        payload.summaryLogId,
        deps.summaryLogsRepository,
        deps.logger
      )
    },
    describe: (payload) => `summaryLogId=${payload.summaryLogId}`
  }
]
