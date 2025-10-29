import { mapRegulator } from './form-data-mapper.js'

/**
 * Extract repeater field data from raw form submission
 * @param {Object} rawFormSubmissionObject - The raw form submission object
 * @param {string} pageTitle - Page title to match
 * @param {Object} fieldMapping - Mapping of shortDescription to output field name
 * @returns {Array<Object>} Array of objects with mapped field names
 */
export function extractRepeaters(
  rawFormSubmissionObject,
  pageTitle,
  fieldMapping
) {
  const repeaterPage = rawFormSubmissionObject?.meta?.definition?.pages?.find(
    (p) => p.title === pageTitle && p.controller === 'RepeatPageController'
  )

  if (!repeaterPage?.repeat?.options?.name) {
    return []
  }

  const repeaterName = repeaterPage.repeat.options.name
  const repeaterData = rawFormSubmissionObject?.data?.repeaters?.[repeaterName]

  if (repeaterData == null) {
    return []
  }

  if (!Array.isArray(repeaterData)) {
    throw new TypeError(
      `Invalid repeater data for "${pageTitle}": expected array but got ${typeof repeaterData}`
    )
  }

  const componentMap = new Map(
    repeaterPage.components.flatMap((component) => {
      const outputName = fieldMapping[component.shortDescription]
      return outputName == null ? [] : [[component.name, outputName]]
    })
  )

  return repeaterData.map((item) =>
    [...componentMap]
      .filter(([componentName]) => item[componentName] != null)
      .reduce((result, [componentName, outputName]) => {
        result[outputName] = item[componentName]
        return result
      }, {})
  )
}

/**
 * Extract all non-repeatable answers from form submission
 * @param {Object} rawSubmissionData - The raw submission data object
 * @returns {Object} Nested object grouped by page title with shortDescription as keys
 * @throws {Error} If required fields are missing, duplicate page title or shortDescription are detected within the same page
 */
export function extractAnswers(rawSubmissionData) {
  const pages = rawSubmissionData?.meta?.definition?.pages
  const mainData = rawSubmissionData?.data?.main

  if (!pages) {
    throw new Error('extractAnswers: Missing pages definition')
  }

  if (!Array.isArray(pages)) {
    throw new TypeError(
      `extractAnswers: pages must be an array, got ${typeof pages}`
    )
  }

  if (!mainData) {
    throw new Error('extractAnswers: Missing or invalid data.main')
  }

  return pages.reduce((result, page) => {
    const pageTitle = page.title

    if (result[pageTitle]) {
      throw new Error(`Duplicate page title detected: "${pageTitle}"`)
    }

    result[pageTitle] = (page.components || [])
      .filter(
        (component) =>
          component.shortDescription &&
          component.name &&
          mainData[component.name] !== undefined
      )
      .reduce((acc, component) => {
        const { shortDescription, name } = component
        if (acc[shortDescription] !== undefined) {
          throw new Error(
            `Duplicate shortDescription detected in page "${pageTitle}": ${shortDescription}`
          )
        }
        acc[shortDescription] = mainData[name]
        return acc
      }, {})

    return result
  }, {})
}

const KNOWN_DUPLICATE_PREFIXES = [
  'Authorised packaging waste categories',
  'Authorised weight',
  'Timescale'
]

function isKnownDuplicateShortDescription(shortDescription) {
  return KNOWN_DUPLICATE_PREFIXES.some((prefix) =>
    shortDescription.startsWith(prefix)
  )
}

/**
 * Flatten nested answers by shortDescription from nested page structure
 * @param {Object} answers - Nested object grouped by page title
 * @returns {Object} Flattened object with shortDescription as keys and submitted values
 * @throws {Error} If duplicate shortDescriptions are found (excluding allowed duplicates)

 */
export function flattenAnswersByShortDesc(answers) {
  const flattened = {}
  const seen = new Set()
  const duplicates = []

  for (const [shortDescription, value] of Object.values(answers).flatMap(
    (answersForSinglePage) => Object.entries(answersForSinglePage)
  )) {
    if (
      seen.has(shortDescription) &&
      !isKnownDuplicateShortDescription(shortDescription)
    ) {
      duplicates.push(shortDescription)
    }
    seen.add(shortDescription)
    flattened[shortDescription] = value
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate fields found: ${duplicates.join(', ')}`)
  }

  return flattened
}

/**
 * Retrieve file upload details by shortDescription
 * @param {Object} rawSubmissionData - The raw submission data object
 * @param {string} shortDescription - The shortDescription of the file upload field
 * @returns {Array<Object>} Array of file upload details with transformed keys
 */
export function retrieveFileUploadDetails(rawSubmissionData, shortDescription) {
  const pages = rawSubmissionData?.meta?.definition?.pages
  const files = rawSubmissionData?.data?.files

  const component = pages
    ?.flatMap((page) => page.components || [])
    .find(
      (comp) =>
        comp.type === 'FileUploadField' &&
        comp.shortDescription === shortDescription
    )

  if (!component) {
    throw new Error(
      `File upload field not found for shortDescription: ${shortDescription}`
    )
  }

  const fileUploads = files?.[component.name]
  if (!Array.isArray(fileUploads) || fileUploads.length === 0) {
    throw new Error(`No files uploaded for field: ${shortDescription}`)
  }

  return fileUploads.map((file) => ({
    defraFormUploadedFileId: file.fileId,
    defraFormUserDownloadLink: file.userDownloadLink
  }))
}

export function extractTimestamp(rawSubmissionData) {
  const timestamp = rawSubmissionData?.meta?.timestamp?.trim()

  if (!timestamp) {
    return undefined
  }

  const resultDate = new Date(timestamp)

  if (Number.isNaN(resultDate.getTime())) {
    return null
  }

  return resultDate
}

export function extractAgencyFromDefinitionName(rawSubmissionData) {
  const definitionName = rawSubmissionData?.meta?.definition?.name

  if (!definitionName) {
    return undefined
  }

  // Match pattern like "(EA)" or "(SEPA)" at the end of the name
  const match = definitionName.match(/\(([A-Z]+)\)\s*$/)

  return match ? mapRegulator(match[1]) : undefined
}

/**
 * Find the first field that exists in answers and return its value
 * @param {Object} answers - Object containing answer values
 * @param {Array<string>} fieldNames - Array of field names to check
 * @returns {*} Value of the first field that exists, or undefined
 */
export function findFirstValue(answers, fieldNames) {
  const field = fieldNames.find((f) => answers?.[f])
  return field ? answers[field] : undefined
}
