// @fixme: add coverage
/* c8 ignore start */
const health = {
  method: 'GET',
  path: '/health',
  handler: (_request, h) => h.response({ message: 'success' })
}

export { health }
/* c8 ignore stop */
