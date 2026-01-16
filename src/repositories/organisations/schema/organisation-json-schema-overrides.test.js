import { describe, it, expect } from 'vitest'
import Joi from 'joi'
import { makeEditable } from './organisation-json-schema-overrides.js'

describe('makeEditable', () => {
  it('returns schema as-is if falsy (Line 173)', () => {
    expect(makeEditable(undefined)).toBeUndefined()
    expect(makeEditable(null)).toBeNull()
  })

  it('unwraps Joi.any().when with otherwise (Line 193)', () => {
    // A conditional wrapper that defaults to otherwise
    const schema = Joi.any().when('type', {
      is: 'string',
      then: Joi.forbidden(),
      otherwise: Joi.string()
    })

    const editable = makeEditable(schema)
    // Should have unwrapped Joi.string()
    const description = editable.describe()
    expect(description.type).toBe('string')
  })

  it('unwraps Joi.any().when with switch (Line 194-195)', () => {
    const schema = Joi.any().when('type', {
      switch: [
        { is: 'A', then: Joi.forbidden() }, // Forbidden branch
        { is: 'B', then: Joi.string() } // Permissive branch
      ]
    })
    const editable = makeEditable(schema)
    const description = editable.describe()
    expect(description.type).toBe('string')
  })

  it('unwraps Joi.any().when with switch using otherwise (Line 194-195 coverage)', () => {
    // Manually construct a mock schema-like object to bypass Joi validation
    // and test the switch loop logic for branch coverage.
    // This allows us to have a switch item without 'then', and with 'otherwise'.

    const targetSchema = Joi.number()
    const mockSchema = {
      clone: () => mockSchema,
      describe: () => ({ type: 'any' }),
      $_terms: {
        whens: [
          {
            switch: [
              { is: 'A', otherwise: targetSchema }, // Covers if (s.then) false, if (s.otherwise) true
              { is: 'B' } // Covers if (s.then) false, if (s.otherwise) false
            ]
          }
        ]
      }
    }

    const editable = makeEditable(mockSchema)
    const description = editable.describe()
    expect(description.type).toBe('number')
  })

  it('keeps Joi.any() if all branches are forbidden (Line 211)', () => {
    const schema = Joi.any().when('type', {
      is: 'A',
      then: Joi.forbidden(),
      otherwise: Joi.forbidden()
    })
    const editable = makeEditable(schema)
    const description = editable.describe()
    // Should result in Joi.any() (fallback)
    expect(description.type).toBe('any')
    expect(editable.$_terms.whens).toBeUndefined()
  })

  it('strips "when" from Typed schemas', () => {
    // Joi.string().when(...)
    const schema = Joi.string().when('other', {
      is: 'x',
      then: Joi.required()
    })
    const editable = makeEditable(schema)
    expect(editable.describe().type).toBe('string')
    expect(editable.$_terms.whens).toBeUndefined()
  })

  it('recursively makes array items editable', () => {
    const itemSchema = Joi.string().required()
    const arraySchema = Joi.array().items(itemSchema)
    const editable = makeEditable(arraySchema)

    const itemDescription = editable.$_terms.items[0].describe()
    // Item should be optional now (permissive)
    // Joi optional() usually removes presence flag or sets it to optional
    // describe() output: flags: { presence: 'required' } vs undefined/optional
    expect(itemDescription.flags?.presence).not.toBe('required')
  })

  it('handles Object with ONLY non-editable keys (Line 233 coverage)', () => {
    const schema = Joi.object({
      id: Joi.string()
    })
    const editable = makeEditable(schema)
    const desc = editable.describe()

    // editable.length should be 0, skipping the recursive fork block
    // nonEditable.length should be > 0, entering that block
    const idDesc = desc.keys.id
    expect(idDesc.metas).toEqual(expect.arrayContaining([{ readOnly: true }]))
  })

  it('handles Object with non-editable keys', () => {
    const schema = Joi.object({
      id: Joi.string(),
      name: Joi.string()
    })
    const editable = makeEditable(schema)
    const desc = editable.describe()

    // key 'id' is in NON_EDITABLE_KEYS
    const idDesc = desc.keys.id

    // It should have .meta({ readOnly: true }) which appears as 'metas' in describe output
    expect(idDesc.metas).toEqual(expect.arrayContaining([{ readOnly: true }]))

    // key 'name' is editable, should NOT have readOnly meta
    const nameDesc = desc.keys.name
    expect(nameDesc.meta).toBeUndefined()
  })

  it('recursively handles Object with nested editable keys', () => {
    const schema = Joi.object({
      child: Joi.object({
        GrandChild: Joi.string().required()
      })
    })
    const editable = makeEditable(schema)
    const desc = editable.describe()

    // .keys.child is now a schema object description
    // But wait, .describe() on the whole schema returns { type: 'object', keys: { child: { ... } } }
    // but we forked it.

    // When we use makeEditable, we wrap final schema in .optional().allow(null).
    // So editable is Joi.object()...

    // Let's verify structure deeply
    const childKey = desc.keys.child
    // childKey is the description of the child schema
    // It should have keys.GrandChild

    const grandChildDesc = childKey.keys.GrandChild
    expect(grandChildDesc.flags?.presence).not.toBe('required')
  })
})
