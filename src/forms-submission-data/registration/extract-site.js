import { REGISTRATION } from './form-field-constants.js'
import { parseUkAddress } from '#formsubmission/parsing-common/parse-address.js'
import {
  mapTimeScale,
  convertToNumber
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { MATERIAL } from '#domain/organisations/model.js'

const SITE_CAPACITY_BY_MATERIALS = [
  {
    config: REGISTRATION.SITE_CAPACITY_ALUMINIUM,
    material: MATERIAL.ALUMINIUM
  },
  {
    config: REGISTRATION.SITE_CAPACITY_FIBRE_BASED_COMPOSITE,
    material: MATERIAL.FIBRE
  },
  {
    config: REGISTRATION.SITE_CAPACITY_GLASS,
    material: MATERIAL.GLASS
  },
  {
    config: REGISTRATION.SITE_CAPACITY_PAPER_OR_BOARD,
    material: MATERIAL.PAPER
  },
  {
    config: REGISTRATION.SITE_CAPACITY_PLASTIC,
    material: MATERIAL.PLASTIC
  },
  {
    config: REGISTRATION.SITE_CAPACITY_STEEL,
    material: MATERIAL.STEEL
  },
  {
    config: REGISTRATION.SITE_CAPACITY_WOOD,
    material: MATERIAL.WOOD
  }
]

function getSiteAddress(answersByShortDescription) {
  const siteAddress =
    answersByShortDescription[REGISTRATION.SITE_DETAILS.fields.SITE_ADDRESS]

  return parseUkAddress(siteAddress)
}

function getSiteCapacity(answersByPages) {
  const siteCapacity = SITE_CAPACITY_BY_MATERIALS.map(
    ({ config, material }) => {
      const pageData = answersByPages[config.title]

      if (!pageData[config.fields.TIMESCALE]) {
        return undefined
      }

      return {
        material,
        siteCapacityInTonnes: convertToNumber(
          pageData[config.fields.CAPACITY],
          'siteCapacityInTonnes'
        ),
        siteCapacityTimescale: mapTimeScale(pageData[config.fields.TIMESCALE])
      }
    }
  ).filter(Boolean)

  return siteCapacity
}

export function getSiteDetails(answersByShortDescription, answersByPages) {
  return {
    address: getSiteAddress(answersByShortDescription),
    gridReference:
      answersByShortDescription[
        REGISTRATION.SITE_DETAILS.fields.GRID_REFERENCE
      ],
    siteCapacity: getSiteCapacity(answersByPages)
  }
}
