/**
 * @typedef {Object} MockWorkersPluginOptions
 * @property {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} [summaryLogsWorker] - Mock worker to use
 */

/** @returns {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} */
const createNoOpWorker = () => ({
  validate: async () => {},
  submit: async () => {}
})

// No Piscina thread pool - runs synchronously for predictable test behaviour.
export const mockWorkersPlugin = {
  name: 'workers',
  version: '1.0.0',

  /** @param {MockWorkersPluginOptions} [options] */
  register: (server, options = {}) => {
    const summaryLogsWorker = options.summaryLogsWorker ?? createNoOpWorker()

    server.decorate('request', 'summaryLogsWorker', () => summaryLogsWorker, {
      apply: true
    })
  }
}
