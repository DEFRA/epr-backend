async function acquireLock(locker, resource, logger) {
  const lock = await locker.lock(resource)
  if (!lock) {
    // @fixme: add coverage
    /* istanbul ignore next */
    if (logger) {
      logger.error(`Failed to acquire lock for ${resource}`)
    }
    return null
  }
  return lock
}

async function requireLock(locker, resource) {
  const lock = await locker.lock(resource)
  if (!lock) {
    throw new Error(`Failed to acquire lock for ${resource}`)
  }
  return lock
}

export { acquireLock, requireLock }
