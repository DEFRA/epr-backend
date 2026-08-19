import { mapRegulator } from './form-data-mapper.js'
import { isNil } from '#common/helpers/is-nil.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

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

  if (isNil(repeaterData)) {
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
      return isNil(outputName) ? [] : [[component.name, outputName]]
    })
  )

  return repeaterData.map((item) =>
    [...componentMap]
      .filter(([componentName]) => !isNil(item[componentName]))
      .reduce((result, [componentName, outputName]) => {
        result[outputName] = item[componentName]
        return result
      }, {})
  )
}

/**
 * Derive a unique key for a page: its own title, falling back to the title
 * of its first non-Markdown component.
 *
 * DEFRA Forms used to backfill a blank page.title with the first
 * non-Markdown question's title at form-display time, but removed that
 * overwrite as part of Welsh translation work - it broke the translation
 * framework and wasn't the correct way for them to do it (see
 * https://defra-digital-team.slack.com/archives/C080WP62PJP/p1787136873848939).
 * We reconstruct it here instead, from the question's own title.
 *
 * Returns undefined for pages with no title and no question component
 * (e.g. summary pages), which callers should skip.
 * @param {Object} page - A page from the form definition
 * @returns {string|undefined} The derived page key, or undefined if none can be derived
 */
function derivePageKey(page) {
  const title = page.title?.trim()
  if (title) {
    return title
  }

  return page.components
    ?.find(
      (component) => component.type !== 'Markdown' && component.title?.trim()
    )
    ?.title.trim()
}

/**
 * Extract all non-repeatable answers from form submission
 * @param {Object} rawSubmissionData - The raw submission data object
 * @returns {Object} Nested object grouped by page key (title, or derived from the
 *   first question's title when the page title is blank) with shortDescription as keys
 * @throws {Error} If required fields are missing, duplicate page key or shortDescription are detected within the same page
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
    const pageKey = derivePageKey(page)

    if (isNil(pageKey)) {
      return result
    }

    if (Object.hasOwn(result, pageKey)) {
      throw new Error(`Duplicate page title detected: "${pageKey}"`)
    }

    result[pageKey] = (page.components || [])
      .filter(
        (component) =>
          component.shortDescription &&
          component.name &&
          mainData[component.name]?.trim() &&
          mainData[component.name].trim().length > 0
      )
      .reduce((acc, component) => {
        const { shortDescription, name } = component
        if (acc[shortDescription] !== undefined) {
          throw new Error(
            `Duplicate shortDescription detected in page "${pageKey}": ${shortDescription}`
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
    return []
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

/**
 * Extract agency code from a definition name string
 * @param {string} definitionName - The definition name to parse
 * @returns {string|undefined} The agency code if found (e.g., "EA", "SEPA"), or undefined
 */
export function extractAgencyCodeFromName(definitionName) {
  if (!definitionName) {
    return undefined
  }
  const match = /\(([A-Z]+)\)\s*$/.exec(definitionName)
  return match ? match[1] : undefined
}

export function extractAgencyFromDefinitionName(rawSubmissionData) {
  const definitionName = rawSubmissionData?.meta?.definition?.name
  const agencyCode = extractAgencyCodeFromName(definitionName)
  return agencyCode ? mapRegulator(agencyCode) : undefined
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

/**
 * Extract waste processing type from form definition name
 * @param {Object} rawSubmissionData - The raw submission data object
 * @returns {import('#domain/organisations/model.js').WasteProcessingTypeValue} The waste processing type enum value
 * @throws {Error} If waste processing type cannot be determined from definition name
 */
export function extractWasteProcessingType(rawSubmissionData) {
  const definitionName = rawSubmissionData?.meta?.definition?.name

  if (!definitionName) {
    throw new Error(
      'extractWasteProcessingTypeFromDefinitionName: Missing definition.name'
    )
  }

  const lowerName = definitionName.toLowerCase()

  if (lowerName.includes('exporter')) {
    return WASTE_PROCESSING_TYPE.EXPORTER
  }

  if (lowerName.includes('reprocessor')) {
    return WASTE_PROCESSING_TYPE.REPROCESSOR
  }

  // If neither is found, throw an error with the actual definition name
  throw new Error(
    `extractWasteProcessingTypeFromDefinitionName: Cannot determine waste processing type from definition name: "${definitionName}"`
  )
}
