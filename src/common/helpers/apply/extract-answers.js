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

export function extractNations(answers) {
  return answers.find(
    ({ shortDescription }) =>
      shortDescription === FORM_FIELDS_SHORT_DESCRIPTIONS.NATIONS
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
