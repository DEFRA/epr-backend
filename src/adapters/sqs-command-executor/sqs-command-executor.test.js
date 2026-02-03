import Hapi from '@hapi/hapi'

import { createSqsCommandExecutor } from './sqs-command-executor.js'
import { sqsCommandExecutorPlugin } from './sqs-command-executor.plugin.js'

describe('createSqsCommandExecutor', () => {
  let executor
  let logger

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    executor = createSqsCommandExecutor(logger)
  })

  it('creates command executor instance', () => {
    expect(executor).toBeDefined()
    expect(executor.validate).toBeInstanceOf(Function)
    expect(executor.submit).toBeInstanceOf(Function)
  })

  describe('validate', () => {
    it('completes without error', async () => {
      await expect(
        executor.validate('summary-log-123')
      ).resolves.toBeUndefined()
    })
  })

  describe('submit', () => {
    it('completes without error', async () => {
      await expect(executor.submit('summary-log-123')).resolves.toBeUndefined()
    })
  })
})

describe('sqsCommandExecutorPlugin', () => {
  let server

  beforeEach(async () => {
    server = Hapi.server()
    server.logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }
  })

  afterEach(async () => {
    await server.stop()
  })

  it('has correct plugin name', () => {
    expect(sqsCommandExecutorPlugin.name).toBe('workers')
  })

  it('has correct plugin version', () => {
    expect(sqsCommandExecutorPlugin.version).toBe('1.0.0')
  })

  it('registers without error', async () => {
    await server.register(sqsCommandExecutorPlugin)

    expect(server.registrations.workers).toBeDefined()
  })

  it('decorates request with summaryLogsWorker', async () => {
    await server.register(sqsCommandExecutorPlugin)

    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        return {
          hasWorker: !!request.summaryLogsWorker,
          hasValidate: typeof request.summaryLogsWorker.validate === 'function',
          hasSubmit: typeof request.summaryLogsWorker.submit === 'function'
        }
      }
    })

    const response = await server.inject({
      method: 'GET',
      url: '/test'
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      hasWorker: true,
      hasValidate: true,
      hasSubmit: true
    })
  })
})
