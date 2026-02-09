/**
 * Represents an error that should not be retried.
 *
 * When the queue consumer catches a PermanentError, it marks the summary log
 * as failed and allows the message to be deleted. All other errors are treated
 * as transient and rethrown so SQS can retry the message.
 */
export class PermanentError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PermanentError'
  }
}
