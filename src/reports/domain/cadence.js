export const CADENCE = Object.freeze({
  monthly: 'monthly',
  quarterly: 'quarterly'
})

export const MONTHS_PER_PERIOD = Object.freeze({
  [CADENCE.monthly]: 1,
  [CADENCE.quarterly]: 3
})
