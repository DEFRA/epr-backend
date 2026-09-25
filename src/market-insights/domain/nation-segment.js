import { REGULATOR_FOR_NATION } from '#domain/organisations/model.js'

/**
 * A nation's path segment. Every path under market insights hyphenates, so the
 * segment is the hyphenated spelling of the nation.
 *
 * @param {string} nation
 */
export const nationSegment = (nation) => nation.replaceAll('_', '-')

/**
 * The regulator each nation's path segment stands for.
 *
 * @type {Readonly<Record<string, import('#domain/organisations/model.js').RegulatorValue>>}
 */
export const REGULATOR_FOR_NATION_SEGMENT = Object.freeze(
  Object.fromEntries(
    Object.entries(REGULATOR_FOR_NATION).map(([nation, regulator]) => [
      nationSegment(nation),
      regulator
    ])
  )
)
