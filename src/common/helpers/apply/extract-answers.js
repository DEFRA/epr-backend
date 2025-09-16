import { FORM_FIELDS_SHORT_DESCRIPTIONS } from '../../enums/index.js'
import { getConfig } from '../../../config.js'

export function extractAnswers(payload) {
  return (
    payload?.meta?.definition?.pages?.reduce((prev, { components }) => {
      const values = components.reduce(
        (prevComponents, { name, shortDescription, title, type }) => {
          const value = payload?.data?.main?.[name]

          return value !== undefined && value !== null
            ? [
                ...prevComponents,
                {
                  shortDescription,
                  title,
                  type,
                  value
                }
              ]
            : prevComponents
        },
        []
      )

      return values.length ? [...prev, ...values] : prev
    }, []) ?? []
  )
}

export function extractEmail(answers) {
  return answers.find(
    ({ shortDescription }) =>
      shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.EMAIL
  )?.value
}

export function extractOrgId(answers) {
  const { value } =
    answers.find(
      ({ shortDescription }) =>
        shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_ID
    ) ?? {}

  const orgId = parseInt(value, 10)

  return isNaN(orgId) ? undefined : orgId
}

export function extractOrgName(answers) {
  return answers.find(
    ({ shortDescription }) =>
      shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_NAME
  )?.value
}

export function extractReferenceNumber(answers) {
  return answers.find(
    ({ shortDescription }) =>
      shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.REFERENCE_NUMBER
  )?.value
}

export function getRegulatorEmail({ meta }) {
  const config = getConfig()
  const { name } = meta?.definition ?? {}

  const [, regulatorId] = name?.match(/\((\w+)\)$/) ?? []

  if (!regulatorId) {
    return undefined
  }

  return config.get(`regulator.${regulatorId}.email`) ?? undefined
}

/**
 * Better to model taking account of data coming from EPR UI, not just contingency forms
 * TODO: things to consider. e.g "Palace of Westminster,London"
 * 1. can comma come in address lines
 * 2. format is assumed to be  is line1,line2(optional), city,county(optional), postcode
 * 3. think about how to parse when only line2 or county is provided
 *
 */

export function extractAddress(answers, addressType) {
  const parts =
    answers
      .find(({ shortDescription }) => shortDescription === addressType)
      ?.value?.split(',')
      .map((part) => part.trim()) || []

  if (parts.length === 5) {
    return {
      line1: parts[0],
      line2: parts[1],
      city: parts[2],
      county: parts[3],
      postcode: parts[4]
    }
  }

  if (parts.length === 3) {
    return {
      line1: parts[0],
      line2: null,
      city: parts[1],
      county: null,
      postcode: parts[2]
    }
  }

  return null
}
export const extractOrgAddress = (answers) =>
  extractAddress(answers, FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_ADDRESS)

export function extractCompaniesHouseNumber(answers) {
  const companiesHouseNumber = answers.find(
    ({ shortDescription }) =>
      shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.COMPANIES_HOUSE_NUMBER
  )?.value

  // Clean the input (remove spaces, convert to uppercase) - returns empty string if null/undefined
  const cleaned =
    companiesHouseNumber?.trim().toUpperCase().replace(/\s/g, '') || ''

  // Validate format: 8 digits OR 2 letters + 6 digits
  const companiesHousePattern = /^([A-Z]{2}[0-9]{6}|[0-9]{8})$/

  return companiesHousePattern.test(cleaned) ? cleaned : null
}

export function extractReprocessingNations(answers) {
  // Create a Set for faster lookup (lowercase for comparison)
  const validNationsSet = new Set([
    'england',
    'scotland',
    'wales',
    'northern ireland'
  ])

  // Helper function to capitalize first letter of each word
  const capitalizeWords = (str) => {
    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    answers
      .find(
        ({ shortDescription }) =>
          shortDescription ===
          FORM_FIELDS_SHORT_DESCRIPTIONS.REPROCESSING_NATIONS
      )
      ?.value?.split(',')
      .map((nation) => nation.trim())
      // TODO do we parse and fail incorrect data? or store what has been provided and log any unexpected value
      .filter((nation) => validNationsSet.has(nation.toLowerCase()))
      .map((nation) => capitalizeWords(nation)) || []
  )
}
