/**
 * Command types that can be sent to the SQS command queue.
 *
 * Each command type maps to a handler in the queue consumer's registry.
 */
export const COMMAND_TYPE = Object.freeze({
  VALIDATE: 'validate',
  SUBMIT: 'submit'
})
