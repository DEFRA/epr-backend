import Joi from 'joi'

/**
 * Commands that can be sent to the SQS command queue.
 */
export const COMMAND_TYPE = Object.freeze({
  VALIDATE: 'validate',
  SUBMIT: 'submit',
  RECALCULATE_BALANCE: 'recalculate_balance'
})

const userSchema = Joi.object({
  id: Joi.string().required(),
  email: Joi.string().required(),
  scope: Joi.array().items(Joi.string()).required()
})

const validateCommandSchema = Joi.object({
  command: Joi.string().valid(COMMAND_TYPE.VALIDATE).required(),
  summaryLogId: Joi.string().required()
})

const submitCommandSchema = Joi.object({
  command: Joi.string().valid(COMMAND_TYPE.SUBMIT).required(),
  summaryLogId: Joi.string().required(),
  user: userSchema.optional()
})

const recalculateBalanceCommandSchema = Joi.object({
  command: Joi.string().valid(COMMAND_TYPE.RECALCULATE_BALANCE).required(),
  accreditationId: Joi.string().required()
})

/**
 * Per-command schema registry. Each command type maps to a Joi schema
 * that validates the full message shape for that command.
 * @type {Record<string, Joi.ObjectSchema>}
 */
const COMMAND_SCHEMAS = {
  [COMMAND_TYPE.VALIDATE]: validateCommandSchema,
  [COMMAND_TYPE.SUBMIT]: submitCommandSchema,
  [COMMAND_TYPE.RECALCULATE_BALANCE]: recalculateBalanceCommandSchema
}

const commandEnvelope = Joi.object({
  command: Joi.string()
    .valid(...Object.keys(COMMAND_SCHEMAS))
    .required()
}).unknown(true)

/**
 * Validates a parsed message body using a two-pass approach:
 * 1. Validates the `command` field against known command types
 * 2. Validates the full message against the per-command schema
 *
 * This produces clear error messages — either "unknown command type"
 * or "field X is required for command Y".
 *
 * @param {object} parsed - The parsed message body
 * @returns {{ error?: Joi.ValidationError, value?: object }}
 */
export const validateCommandMessage = (parsed) => {
  const { error: envelopeError } = commandEnvelope.validate(parsed)
  if (envelopeError) {
    return { error: envelopeError }
  }

  const schema = COMMAND_SCHEMAS[parsed.command]
  return schema.validate(parsed)
}
