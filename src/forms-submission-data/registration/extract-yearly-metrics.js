import { FORM_PAGES } from '../parsing-common/form-field-constants.js'
import { extractRepeaters } from '../parsing-common/parse-forms-data.js'
import {
  mapValueType,
  convertToNumber
} from '../parsing-common/form-data-mapper.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

function getInputData(answersByPages) {
  const inputPage = FORM_PAGES.REGISTRATION.INPUT_TO_RECYLING
  const inputData = answersByPages[inputPage.title]

  return {
    type: mapValueType(inputData[inputPage.fields.ESTIMATED_OR_ACTUAL]),
    ukPackagingWasteInTonnes: convertToNumber(
      inputData[inputPage.fields.UK_PACKAGING_WASTE],
      'ukPackagingWasteInTonnes'
    ),
    nonUkPackagingWasteInTonnes: convertToNumber(
      inputData[inputPage.fields.NON_UK_PACKAGING_WASTE],
      'nonUkPackagingWasteInTonnes'
    ),
    nonPackagingWasteInTonnes: convertToNumber(
      inputData[inputPage.fields.NON_PACKAGING_WASTE],
      'nonPackagingWasteInTonnes'
    )
  }
}

function getRawMaterialInputs(rawSubmissionData) {
  const rawMaterialPage =
    FORM_PAGES.REGISTRATION.INPUT_TO_RECYLING.INPUT_RAW_MATERIAL
  const rawMaterials = extractRepeaters(
    rawSubmissionData,
    rawMaterialPage.title,
    {
      [rawMaterialPage.fields.MATERIAL]: 'material',
      [rawMaterialPage.fields.TONNAGE]: 'weightInTonnes'
    }
  )

  return rawMaterials.map((rawMaterial) => ({
    material: rawMaterial.material,
    weightInTonnes: convertToNumber(
      rawMaterial.weightInTonnes,
      'rawMaterials.tonnage'
    )
  }))
}

function getOutputData(answersByPages) {
  const outputPage =
    FORM_PAGES.REGISTRATION.INPUT_TO_RECYLING.OUTPUT_FROM_RECYCLING
  const outputData = answersByPages[outputPage.title]

  return {
    type: mapValueType(outputData[outputPage.fields.ESTIMATED_OR_ACTUAL]),
    sentToAnotherSiteInTonnes: convertToNumber(
      outputData[outputPage.fields.TONNAGE_SENT_TO_ANOTHER_SITE],
      'sentToAnotherSiteInTonnes'
    ),
    contaminantsInTonnes: convertToNumber(
      outputData[outputPage.fields.TOTAL_CONTAMINANTS],
      'contaminantsInTonnes'
    ),
    processLossInTonnes: convertToNumber(
      outputData[outputPage.fields.PROCESS_LOSS],
      'processLossInTonnes'
    )
  }
}

function getProductsMadeFromRecycling(rawSubmissionData) {
  const productsPage = FORM_PAGES.REGISTRATION.INPUT_TO_RECYLING.PRODUCTS_MADE

  const products = extractRepeaters(rawSubmissionData, productsPage.title, {
    [productsPage.fields.NAME]: 'name',
    [productsPage.fields.TONNAGE]: 'weightInTonnes'
  })

  return products.map((product) => ({
    name: product.name,
    weightInTonnes: convertToNumber(product.weightInTonnes, 'weightInTonnes')
  }))
}

/**
 * Extract yearly metrics data from form submission
 * @param {import('#domain/organisations/model.js').WasteProcessingTypeValue} wasteProcessingType - Type of waste processing
 * @param {Object} rawSubmissionData - Raw form submission data
 * @param {Object} answersByPages - Answers organized by page title
 * @returns {Array} Yearly metrics data including year, input, output, and products
 */
export function getYearlyMetrics(
  wasteProcessingType,
  rawSubmissionData,
  answersByPages
) {
  return wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
    ? [
        {
          year: 2024,
          input: getInputData(answersByPages),
          rawMaterialInputs: getRawMaterialInputs(rawSubmissionData),
          output: getOutputData(answersByPages),
          productsMadeFromRecycling:
            getProductsMadeFromRecycling(rawSubmissionData)
        }
      ]
    : undefined
}
