const ROLE_EMAIL_LIST_KEYS = [
  'roles.serviceMaintainers',
  'roles.serviceMaintainersWrite',
  'roles.support'
]

/**
 * A string made by repeating a shorter one turns up again inside itself
 * doubled, before the end of the first copy.
 *
 * @param {string} value
 */
const isRepeatedPattern = (value) =>
  `${value}${value}`.indexOf(value, 1) < value.length

const validateUploadCallbackKey = (config) => {
  if (
    config.get('cdpEnvironment') !== 'local' &&
    isRepeatedPattern(config.get('cdpUploader.callbackHmacKey'))
  ) {
    throw new Error(
      'Invalid cdpUploader.callbackHmacKey configuration: a repeated pattern, not a random key'
    )
  }
}

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

  validateUploadCallbackKey(config)
}
