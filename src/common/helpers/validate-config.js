const ROLE_EMAIL_LIST_KEYS = [
  'roles.serviceMaintainers',
  'roles.serviceMaintainersWrite',
  'roles.support'
]

export function validateConfig(config) {
  for (const key of ROLE_EMAIL_LIST_KEYS) {
    let parsed
    try {
      parsed = JSON.parse(config.get(key))
    } catch {
      throw new Error(`Invalid ${key} configuration: malformed JSON`)
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid ${key} configuration: not an array`)
    }
  }
}
