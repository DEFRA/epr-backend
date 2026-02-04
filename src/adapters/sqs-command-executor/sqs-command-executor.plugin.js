import { createSqsCommandExecutor } from './sqs-command-executor.js'

export const sqsCommandExecutorPlugin = {
  name: 'sqs-command-executor',
  version: '1.0.0',

  register: (server) => {
    const summaryLogsWorker = createSqsCommandExecutor(server.logger)

    server.decorate('request', 'summaryLogsWorker', () => summaryLogsWorker, {
      apply: true
    })
  }
}
