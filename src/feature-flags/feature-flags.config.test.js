import { describe, it, expect, vi } from 'vitest'
import { createConfigFeatureFlags } from './feature-flags.config.js'

/** @type {Array<[keyof import('./feature-flags.port.js').FeatureFlags, string]>} */
const FLAGS = [
  ['isDevEndpointsEnabled', 'featureFlags.devEndpoints'],
  [
    'isPreCpaResubmissionBackfillEnabled',
    'featureFlags.preCpaResubmissionBackfill'
  ],
  [
    'isPreCpaResubmissionReportEnabled',
    'featureFlags.preCpaResubmissionReport'
  ],
  [
    'isStaleIssuedTonnageReportEnabled',
    'featureFlags.staleIssuedTonnageReport'
  ],
  [
    'isExporterReportDataValidationEnabled',
    'featureFlags.exporterReportDataValidation'
  ]
]

describe('createConfigFeatureFlags', () => {
  it.each(FLAGS)('%s reads %s from config', (method, configKey) => {
    const config = { get: vi.fn().mockReturnValue(true) }

    const flags = createConfigFeatureFlags(config)

    expect(flags[method]()).toBe(true)
    expect(config.get).toHaveBeenCalledWith(configKey)
  })
})
