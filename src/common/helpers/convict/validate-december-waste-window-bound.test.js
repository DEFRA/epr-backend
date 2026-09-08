import { convictValidateDecemberWasteWindowBound } from './validate-december-waste-window-bound.js'

describe('#convictValidateDecemberWasteWindowBound', () => {
  test.each(['12-01T00:00', '01-31T23:59', '02-29T00:00'])(
    'accepts a valid MM-DDTHH:mm bound "%s"',
    (value) => {
      expect(() =>
        convictValidateDecemberWasteWindowBound.validate(value)
      ).not.toThrow()
    }
  )

  test.each(['12-1T00:00', '12-01 00:00', '12-01T24:00', 'abc', ''])(
    'throws for a malformed bound "%s"',
    (value) => {
      expect(() =>
        convictValidateDecemberWasteWindowBound.validate(value)
      ).toThrow()
    }
  )

  test.each(['13-01T00:00', '00-01T00:00', '04-31T00:00', '09-31T00:00'])(
    'throws for a bound naming a date that does not exist "%s"',
    (value) => {
      expect(() =>
        convictValidateDecemberWasteWindowBound.validate(value)
      ).toThrow(/must name a real date/)
    }
  )
})
