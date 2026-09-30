import { fromFewOperators } from './confidential-figures.js'

describe('a row from too few operators', () => {
  it.each([1, 2])(
    'holds for a row with %i operators accredited, whether or not it holds data',
    (operatorCount) => {
      expect(fromFewOperators({ operatorCount }, false)).toBe(true)
      expect(fromFewOperators({ operatorCount }, true)).toBe(true)
    }
  )

  it.each([3, 4])(
    'does not hold for a row with %i operators accredited, whether or not it holds data',
    (operatorCount) => {
      expect(fromFewOperators({ operatorCount }, false)).toBe(false)
      expect(fromFewOperators({ operatorCount }, true)).toBe(false)
    }
  )

  it('holds for a row with no operator accredited that still holds data', () => {
    expect(fromFewOperators({ operatorCount: 0 }, true)).toBe(true)
  })

  it('does not hold for a row with no operator accredited and nothing in it', () => {
    expect(fromFewOperators({ operatorCount: 0 }, false)).toBe(false)
  })
})
