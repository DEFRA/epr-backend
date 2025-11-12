import { FORM_PAGES } from '#formsubmission/parsing-common/form-field-constants.js'
import { parseUkAddress } from '#formsubmission/parsing-common/parse-address.js'
import {
  mapTimeScale,
  convertToNumber
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { MATERIAL } from '#domain/organisations.js'

const SITE_CAPACITY_BY_MATERIALS = [
  {
    config: FORM_PAGES.REGISTRATION.SITE_CAPACITY_ALUMINIUM,
    material: MATERIAL.ALUMINIUM
  },
  {
    config: FORM_PAGES.REGISTRATION.SITE_CAPACITY_FIBRE_BASED_COMPOSITE,
    material: MATERIAL.FIBRE
  },
  {
    config: FORM_PAGES.REGISTRATION.SITE_CAPACITY_GLASS,
    material: MATERIAL.GLASS
  },
  {
    config: FORM_PAGES.REGISTRATION.SITE_CAPACITY_PAPER_OR_BOARD,
    material: MATERIAL.PAPER
  },
  {
    config: FORM_PAGES.REGISTRATION.SITE_CAPACITY_PLASTIC,
    material: MATERIAL.PLASTIC
  },
  {
    config: FORM_PAGES.REGISTRATION.SITE_CAPACITY_STEEL,
    material: MATERIAL.STEEL
  },
  {
    config: FORM_PAGES.REGISTRATION.SITE_CAPACITY_WOOD,
    material: MATERIAL.WOOD
  }
]

function getSiteAddress(answersByShortDescription) {
  const siteAddress =
    answersByShortDescription[
      FORM_PAGES.REGISTRATION.SITE_DETAILS.fields.SITE_ADDRESS
    ]

  return siteAddress ? parseUkAddress(siteAddress) : undefined
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
        siteCapacityWeight: convertToNumber(
          pageData[config.fields.CAPACITY],
          'siteCapacityWeight'
        ),
        siteCapacityTimescale: mapTimeScale(pageData[config.fields.TIMESCALE])
      }
    }
  ).filter(Boolean)

  return siteCapacity
}

export function getSiteDetails(answersByShortDescription, answersByPages) {
  const address = getSiteAddress(answersByShortDescription)

  if (!address) {
    return undefined
  }

  return {
    address,
    gridReference:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.SITE_DETAILS.fields.GRID_REFERENCE
      ],
    siteCapacity: getSiteCapacity(answersByPages)
  }
}
