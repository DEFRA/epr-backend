import { config } from '#root/config.js'

export function parseExcludedPrnIds() {
  const raw = config.get('excludedPrnIds')

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error('Invalid excludedPrnIds configuration: malformed JSON', {
      cause: error
    })
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid excludedPrnIds configuration: not an array')
  }

  return parsed.filter((item) => typeof item === 'string' && item.length > 0)
}

export const EXCLUDED_PRN_IDS = parseExcludedPrnIds()
