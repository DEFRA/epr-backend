import { config } from '#root/config.js'

export const getRetrievalKeyForRegulator = (regulator) => {
  const regulatorKey = regulator.toUpperCase()
  const defraEmailPath = `regulator.${regulatorKey}.defraFormsSubmissionEmail`
  const standardEmailPath = `regulator.${regulatorKey}.email`

  const email = config.has(defraEmailPath)
    ? config.get(defraEmailPath)
    : config.get(standardEmailPath)

  return email.toLowerCase()
}
