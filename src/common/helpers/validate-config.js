export function validateConfig(config) {
  try {
    JSON.parse(config.get('userRoles'))
  } catch (error) {
    throw new Error('Invalid userRoles configuration: malformed JSON', {
      cause: error
    })
  }
}
