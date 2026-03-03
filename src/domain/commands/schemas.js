import Joi from 'joi'

import { COMMAND_TYPE } from './types.js'

const userSchema = Joi.object({
  id: Joi.string().required(),
  email: Joi.string().required(),
  scope: Joi.array().items(Joi.string()).required()
})

/**
 * Per-command Joi schemas keyed by command type.
 *
 * Each entry describes the full message shape for that command,
 * including the `command` discriminator field. New command types
 * are added here to extend the queue without touching the consumer.
 */
const COMMAND_SCHEMAS = {
  [COMMAND_TYPE.VALIDATE]: Joi.object({
    command: Joi.string().valid(COMMAND_TYPE.VALIDATE).required(),
    summaryLogId: Joi.string().required(),
    user: userSchema.optional()
  }),

  [COMMAND_TYPE.SUBMIT]: Joi.object({
    command: Joi.string().valid(COMMAND_TYPE.SUBMIT).required(),
    summaryLogId: Joi.string().required(),
    user: userSchema.optional()
  }),

  [COMMAND_TYPE.RECALCULATE_BALANCE]: Joi.object({
    command: Joi.string().valid(COMMAND_TYPE.RECALCULATE_BALANCE).required(),
    organisationId: Joi.string().required(),
    accreditationId: Joi.string().required(),
    registrationId: Joi.string().required(),
    trigger: Joi.string().required()
  })
}

/**
 * Envelope schema used to identify the command type before
 * dispatching to the per-command schema. Only the `command`
 * field is validated here.
 */
const envelopeSchema = Joi.object({
  command: Joi.string()
    .valid(...Object.values(COMMAND_TYPE))
    .required()
}).unknown(true)

/**
 * Two-pass validation for command messages.
 *
 * 1. Validate the envelope to identify the command type.
 * 2. Validate the full message against the per-command schema.
 *
 * @param {object} message - The parsed message body
 * @returns {{ error?: import('joi').ValidationError, value?: object }}
 */
export const validateCommandMessage = (message) => {
  const envelope = envelopeSchema.validate(message)

  if (envelope.error) {
    return { error: envelope.error }
  }

  const commandType = envelope.value.command
  const commandSchema = COMMAND_SCHEMAS[commandType]

  /* c8 ignore next 3 - defensive: envelope validation ensures command is valid */
  if (!commandSchema) {
    return {
      error: new Joi.ValidationError(
        `Unknown command type: ${commandType}`,
        [],
        message
      )
    }
  }

  return commandSchema.validate(message)
}
