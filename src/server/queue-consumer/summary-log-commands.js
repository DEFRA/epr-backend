import Joi from 'joi'

import { SUMMARY_LOG_COMMAND } from '#domain/summary-logs/status.js'
import {
  markAsValidationFailed,
  markAsSubmissionFailed
} from '#domain/summary-logs/mark-as-failed.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'

const userSchema = Joi.object({
  id: Joi.string().required(),
  email: Joi.string().required(),
  scope: Joi.array().items(Joi.string()).required()
})

/**
 * @typedef {object} CommandHandler
 * @property {string} command - The command string (e.g. 'validate', 'submit')
 * @property {import('joi').ObjectSchema} payloadSchema - Validates everything except 'command'
 * @property {(payload: object, deps: object) => Promise<void>} execute - Runs the command
 * @property {(payload: object, deps: object) => Promise<void>} onFailure - Marks as failed on terminal error
 * @property {(payload: object) => string} describe - Returns logging context
 */

/** @type {CommandHandler[]} */
export const summaryLogCommandHandlers = [
  {
    command: SUMMARY_LOG_COMMAND.VALIDATE,
    payloadSchema: Joi.object({
      summaryLogId: Joi.string().required()
    }),
    execute: async (payload, deps) => {
      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: deps.summaryLogsRepository,
        organisationsRepository: deps.organisationsRepository,
        wasteRecordsRepository: deps.wasteRecordsRepository,
        summaryLogExtractor: deps.summaryLogExtractor
      })

      await validateSummaryLog(payload.summaryLogId)
    },
    onFailure: async (payload, deps) => {
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
    execute: async (payload, deps) => {
      await submitSummaryLog(payload.summaryLogId, {
        ...deps,
        user: payload.user
      })
    },
    onFailure: async (payload, deps) => {
      await markAsSubmissionFailed(
        payload.summaryLogId,
        deps.summaryLogsRepository,
        deps.logger
      )
    },
    describe: (payload) => `summaryLogId=${payload.summaryLogId}`
  }
]
