/**
 * @typedef {Object} MockSqsCommandExecutorPluginOptions
 * @property {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} [summaryLogsWorker] - Mock executor to use
 */

/** @returns {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} */
const createNoOpExecutor = () => ({
  validate: async () => {},
  submit: async () => {}
})

// No SQS - runs synchronously for predictable test behaviour.
// Exported as both names: mockSqsCommandExecutorPlugin for createTestServer,
// sqsCommandExecutorPlugin for vi.mock factory replacement.
export const mockSqsCommandExecutorPlugin = {
  name: 'sqs-command-executor',
  version: '1.0.0',

  /** @param {MockSqsCommandExecutorPluginOptions} [options] */
  register: (server, options = {}) => {
    const summaryLogsWorker = options.summaryLogsWorker ?? createNoOpExecutor()

    server.decorate('request', 'summaryLogsWorker', () => summaryLogsWorker, {
      apply: true
    })
  }
}

export { mockSqsCommandExecutorPlugin as sqsCommandExecutorPlugin }
