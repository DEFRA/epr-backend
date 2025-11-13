const health = {
  method: 'GET',
  path: '/health',
  options: {
    auth: false
  },
  handler: (_request, h) => h.response({ message: 'success' })
}

export { health }
