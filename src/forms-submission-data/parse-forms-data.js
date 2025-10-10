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
      return outputName != null ? [[component.name, outputName]] : []
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
