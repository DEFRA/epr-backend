import { accruesDecember } from './resolve-pool.js'

/**
 * Which December Waste declaration control an accreditation is shown,
 * mirroring epr-frontend's DECEMBER_WASTE_CONTROL wire values so the response
 * can be assigned straight into it without translation.
 */
export const DECEMBER_WASTE_CONTROL_MODE = Object.freeze({
  SELECT_POOL: 'pool',
  DECLARE_MANUALLY: 'manual'
})

/**
 * The December Waste control an accreditation's type resolves to: `pool`
 * (accrues a separate December balance to choose from) for every accredited
 * type except a reprocessor on output, which gets `manual` (self-declares the
 * marker for disclosure, having no December balance to derive it from - see
 * `accruesDecember` in resolve-pool.js).
 *
 * @param {{ wasteProcessingType: string, reprocessingType?: string }} accreditation
 * @returns {typeof DECEMBER_WASTE_CONTROL_MODE[keyof typeof DECEMBER_WASTE_CONTROL_MODE]}
 */
export function decemberWasteControlModeFor(accreditation) {
  return accruesDecember(accreditation)
    ? DECEMBER_WASTE_CONTROL_MODE.SELECT_POOL
    : DECEMBER_WASTE_CONTROL_MODE.DECLARE_MANUALLY
}
