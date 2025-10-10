import { acquireLock, requireLock } from './mongo-lock.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/event.js'

const mockLoggerError = vi.fn()

vi.mock('./logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    logger: {
      error: (...args) => mockLoggerError(...args)
    }
  }
})

describe('Lock Functions', () => {
  let locker

  beforeEach(() => {
    locker = {
      lock: vi.fn()
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    vi.resetAllMocks()
  })

  describe('acquireLock', () => {
    test('should acquire lock and return it', async () => {
      const resource = 'testResource'
      const mockLock = { id: 'lockId' }

      locker.lock.mockResolvedValue(mockLock) // Mocking lock method to resolve a lock

      const result = await acquireLock(locker, resource)

      expect(result).toEqual(mockLock)
      expect(mockLoggerError).not.toHaveBeenCalled()
      expect(locker.lock).toHaveBeenCalledWith(resource)
    })

    test('should log error and return null if lock cannot be acquired', async () => {
      const resource = 'testResource'

      locker.lock.mockResolvedValue(null) // Mocking lock method to resolve to null

      const result = await acquireLock(locker, resource)

      expect(result).toBeNull()
      expect(mockLoggerError).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: 'Could not acquire mongo resource lock',
          type: 'MongoLockError'
        }),
        message: `Failed to acquire lock for ${resource}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.LOCK_ACQUISITION_FAILED
        }
      })
      expect(locker.lock).toHaveBeenCalledWith(resource)
    })
  })

  describe('requireLock', () => {
    test('should acquire lock and return it', async () => {
      const resource = 'testResource'
      const mockLock = { id: 'lockId' }

      locker.lock.mockResolvedValue(mockLock) // Mocking lock method to resolve a lock

      const result = await requireLock(locker, resource)

      expect(result).toEqual(mockLock)
      expect(locker.lock).toHaveBeenCalledWith(resource)
    })

    test('should throw error if lock cannot be acquired', async () => {
      const resource = 'testResource'

      locker.lock.mockResolvedValue(null) // Mocking lock method to resolve to null

      await expect(requireLock(locker, resource)).rejects.toThrow(
        `Failed to acquire lock for ${resource}`
      )
      expect(locker.lock).toHaveBeenCalledWith(resource)
    })
  })
})
