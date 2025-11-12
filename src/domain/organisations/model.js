export const STATUS = Object.freeze({
  CREATED: 'created',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived'
})

export const REGULATOR = Object.freeze({
  EA: 'ea',
  NRW: 'nrw',
  SEPA: 'sepa',
  NIEA: 'niea'
})

export const MATERIAL = Object.freeze({
  ALUMINIUM: 'aluminium',
  FIBRE: 'fibre',
  GLASS: 'glass',
  PAPER: 'paper',
  PLASTIC: 'plastic',
  STEEL: 'steel',
  WOOD: 'wood'
})

/**
 * @typedef {'reprocessor' | 'exporter'} WasteProcessingTypeValue
 */

export const WASTE_PROCESSING_TYPE = Object.freeze({
  REPROCESSOR: 'reprocessor',
  EXPORTER: 'exporter'
})

export const NATION = Object.freeze({
  ENGLAND: 'england',
  WALES: 'wales',
  SCOTLAND: 'scotland',
  NORTHERN_IRELAND: 'northern_ireland'
})

export const BUSINESS_TYPE = Object.freeze({
  INDIVIDUAL: 'individual',
  UNINCORPORATED: 'unincorporated',
  PARTNERSHIP: 'partnership'
})

export const PARTNER_TYPE = Object.freeze({
  COMPANY: 'company',
  INDIVIDUAL: 'individual',
  CORPORATE: 'corporate'
})

export const PARTNERSHIP_TYPE = Object.freeze({
  LTD: 'ltd',
  LTD_LIABILITY: 'ltd_liability'
})

export const TIME_SCALE = Object.freeze({
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
})

export const WASTE_PERMIT_TYPE = Object.freeze({
  ENVIRONMENTAL_PERMIT: 'environmental_permit',
  INSTALLATION_PERMIT: 'installation_permit',
  WASTE_EXEMPTION: 'waste_exemption'
})

export const RECYCLING_PROCESS = Object.freeze({
  GLASS_RE_MELT: 'glass_re_melt',
  GLASS_OTHER: 'glass_other'
})

export const TONNAGE_BAND = Object.freeze({
  UP_TO_500: 'up_to_500',
  UP_TO_5000: 'up_to_5000',
  UP_TO_10000: 'up_to_10000',
  OVER_10000: 'over_10000'
})

export const VALUE_TYPE = Object.freeze({
  ACTUAL: 'actual',
  ESTIMATED: 'estimated'
})
