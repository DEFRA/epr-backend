/**
 * @typedef {Object} MockSqsCommandExecutorPluginOptions
 * @property {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} [summaryLogsWorker] - Mock executor to use
 * @property {import('#overseas-sites/imports/worker/port.js').OrsImportsCommandExecutor} [orsImportsWorker] - Mock executor to use
 */

/** @returns {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} */
const createNoOpSummaryLogsExecutor = () => ({
  validate: async () => {},
  submit: async () => {}
})

/** @returns {import('#overseas-sites/imports/worker/port.js').OrsImportsCommandExecutor} */
const createNoOpOrsImportsExecutor = () => ({
  importOverseasSites: async () => {}
})

// No SQS - runs synchronously for predictable test behaviour.
// Exported as both names: mockSqsCommandExecutorPlugin for createTestServer,
// sqsCommandExecutorPlugin for vi.mock factory replacement.
export const mockSqsCommandExecutorPlugin = {
  name: 'sqs-command-executor',
  version: '1.0.0',

  /** @param {MockSqsCommandExecutorPluginOptions} [options] */
  register: (server, options = {}) => {
    const summaryLogsWorker =
      options.summaryLogsWorker ?? createNoOpSummaryLogsExecutor()
    const orsImportsWorker =
      options.orsImportsWorker ?? createNoOpOrsImportsExecutor()

    server.decorate('request', 'summaryLogsWorker', () => summaryLogsWorker, {
      apply: true
    })
    server.decorate('request', 'orsImportsWorker', () => orsImportsWorker, {
      apply: true
    })
  }
}

export { mockSqsCommandExecutorPlugin as sqsCommandExecutorPlugin }
