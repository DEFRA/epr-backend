const ONE_MINUTE = 60_000
const COMMAND_TIMEOUT_MINUTES = 5

/**
 * How long the consumer gives a command before it abandons the message and
 * fires the handler's `onFailure`. Past it, nothing is still working on the
 * command, which is what makes it the bound on how long a record that has not
 * finished can honestly be called in progress.
 */
export const COMMAND_TIMEOUT_MS = COMMAND_TIMEOUT_MINUTES * ONE_MINUTE
