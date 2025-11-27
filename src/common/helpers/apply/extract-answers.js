import { getConfig } from '#root/config.js'
import { FORM_FIELDS_SHORT_DESCRIPTIONS } from '../../enums/index.js'

/**
 * @typedef {{
 *   id: string
 *   type: string
 *   content: string
 *   options: Record<string, any>
 *   schema: Record<string, any>
 * }} DisplayComponent
 */

/**
 * @typedef {{
 *   id: string
 *   type: string
 *   name: string
 *   shortDescription: string
 *   title: string
 *   hint?: string
 *   options: Record<string, any>
 *   schema: Record<string, any>
 * }} InputComponent
 */

/**
 * @typedef {DisplayComponent | InputComponent} Component
 */

/**
 * @typedef {{
 *   components: Component[]
 * }} Page
 */

/**
 * @typedef {{
 *   meta?: {
 *     definition?: {
 *       name?: string
 *       pages?: Page[]
 *     }
 *   }
 *   data?: {
 *     main?: Record<string, any>
 *   }
 * }} FormPayload
 */

/**
 * @typedef {{
 *   shortDescription: string
 *   title: string
 *   type: string
 *   value: any
 * }} Answer
 */

/**
 * Type predicate to check if a component is an InputComponent
 * @param {Component} component
 * @returns {component is InputComponent}
 */
function isInputComponent(component) {
  return 'name' in component
}

/**
 * @param {FormPayload} payload
 * @returns {Answer[]}
 */
export function extractAnswers(payload) {
  return (
    payload?.meta?.definition?.pages?.flatMap(({ components }) =>
      components
        .filter(isInputComponent)
        .map(({ name, shortDescription, title, type }) => ({
          shortDescription,
          title,
          type,
          value: payload?.data?.main?.[name]
        }))
        .filter(({ value }) => value !== undefined && value !== null)
    ) ?? []
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
 * Extracts regulator email from form metadata
 * @param {Pick<FormPayload, 'meta'>} payload
 * @returns {string | undefined}
 */
export function getRegulatorEmail({ meta }) {
  const config = getConfig()
  const { name } = meta?.definition ?? {}

  const [, regulatorId] = name?.match(/\((\w+)\)$/) ?? []

  if (!regulatorId) {
    return undefined
  }

  // @ts-ignore - Dynamic config path causes deep type inference
  return config.get(`regulator.${regulatorId}.email`) ?? undefined
}
