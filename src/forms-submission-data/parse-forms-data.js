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

  if (!Array.isArray(repeaterData)) {
    return []
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
 * @param {Object} rawFormSubmission - The raw form submission object
 * @returns {Object} Nested object grouped by page title with shortDescription as keys
 * @throws {Error} If required fields are missing , duplicate page title or shortDescription are detected within the same page
 */
export function extractAnswers(rawFormSubmission) {
  const pages = rawFormSubmission?.rawSubmissionData?.meta?.definition?.pages
  const mainData = rawFormSubmission?.rawSubmissionData?.data?.main

  if (!pages || !Array.isArray(pages)) {
    throw new Error('extractAnswers: Missing or invalid pages definition')
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

/**
 * Flatten nested answers by shortDescription from nested page structure
 * @param {Object} answers - Nested object grouped by page title
 * @returns {Object} Flattened object with shortDescription as keys and submitted values
 * @throws {Error} If duplicate shortDescriptions are found (excluding allowed duplicates)

 */
export function flattenAnswersByShortDesc(answers) {
  const allowedDuplicatePrefixes = [
    'Authorised packaging waste categories',
    'Authorised weight',
    'Timescale'
  ]

  const isAllowedDuplicate = (shortDescription) =>
    allowedDuplicatePrefixes.some((prefix) =>
      shortDescription.startsWith(prefix)
    )

  const flattened = {}
  const seen = new Set()
  const duplicates = []

  Object.values(answers).forEach((fields) => {
    Object.entries(fields).forEach(([shortDescription, value]) => {
      if (seen.has(shortDescription) && !isAllowedDuplicate(shortDescription)) {
        duplicates.push(shortDescription)
      }
      seen.add(shortDescription)
      flattened[shortDescription] = value
    })
  })

  if (duplicates.length > 0) {
    throw new Error(`Duplicate fields found: ${duplicates.join(', ')}`)
  }

  return flattened
}

/**
 * Retrieve file upload details by shortDescription
 * @param {Object} rawFormSubmission - The raw form submission object
 * @param {string} shortDescription - The shortDescription of the file upload field
 * @returns {Array<Object>} Array of file upload details with transformed keys
 */
export function retrieveFileUploadDetails(rawFormSubmission, shortDescription) {
  const pages = rawFormSubmission?.rawSubmissionData?.meta?.definition?.pages
  const files = rawFormSubmission?.rawSubmissionData?.data?.files

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
