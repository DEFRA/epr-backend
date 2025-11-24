import { getConfig } from '../../../config.js'
import { FORM_FIELDS_SHORT_DESCRIPTIONS } from '../../enums/index.js'

/**
 * @typedef {Object} Component
 * @property {string} name
 * @property {string} shortDescription
 * @property {string} title
 * @property {string} type
 */

/**
 * @typedef {Object} Page
 * @property {Component[]} components
 */

/**
 * @typedef {Object} FormPayload
 * @property {Object} [meta]
 * @property {Object} [meta.definition]
 * @property {Page[]} [meta.definition.pages]
 * @property {Object} [data]
 * @property {Object.<string, *>} [data.main]
 */

/**
 * @typedef {Object} Answer
 * @property {string} shortDescription
 * @property {string} title
 * @property {string} type
 * @property {*} value
 */

/**
 * @param {FormPayload} payload
 * @returns {Answer[]}
 */
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

/**
 * Extracts email from answers
 * @param {Answer[]} answers
 * @returns {string | undefined}
 */
export function extractEmail(answers) {
  return answers.find(
    ({ shortDescription }) =>
      shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.EMAIL
  )?.value
}

/**
 * Extracts organisation id from answers
 * @param {Answer[]} answers
 * @returns {number | undefined}
 */
export function extractOrgId(answers) {
  const { value } =
    answers.find(
      ({ shortDescription }) =>
        shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_ID
    ) ?? {}

  const orgId = parseInt(value, 10)

  return isNaN(orgId) ? undefined : orgId
}

/**
 * Extracts organisation name from answers
 * @param {Answer[]} answers
 * @returns {string | undefined}
 */
export function extractOrgName(answers) {
  return answers.find(
    ({ shortDescription }) =>
      shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_NAME
  )?.value
}

/**
 * Extracts reference number from answers
 * @param {Answer[]} answers
 * @returns {string | undefined}
 */
export function extractReferenceNumber(answers) {
  return answers.find(
    ({ shortDescription }) =>
      shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.REFERENCE_NUMBER
  )?.value
}

/**
 * Extracts reference number from answers
 * @param {Answer[]} answers
 * @returns {string | undefined}
 */
export function getRegulatorEmail({ meta }) {
  const config = getConfig()
  const { name } = meta?.definition ?? {}

  const [, regulatorId] = name?.match(/\((\w+)\)$/) ?? []

  if (!regulatorId) {
    return undefined
  }

  return config.get(`regulator.${regulatorId}.email`) ?? undefined
}
