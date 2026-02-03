import { createSqsCommandExecutor } from './sqs-command-executor.js'

export const sqsCommandExecutorPlugin = {
  name: 'workers',
  version: '1.0.0',

  register: (server) => {
    const summaryLogsWorker = createSqsCommandExecutor(server.logger)

    server.decorate('request', 'summaryLogsWorker', () => summaryLogsWorker, {
      apply: true
    })
  }
}
