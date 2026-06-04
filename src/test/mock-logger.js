import { vi } from 'vitest'

/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */

/**
 * Builds a fully-typed TypedLogger mock with every method as a vi.fn(). `child`
 * returns the same mock so chained logging (and assertions on it) work. Use this
 * instead of hand-rolling inline logger mocks so new TypedLogger methods only
 * need adding in one place.
 *
 * @returns {TypedLogger}
 */
export const createMockLogger = () => {
  /** @type {TypedLogger} */
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => logger)
  }

  return logger
}
