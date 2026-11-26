// 0.7.0: a person without a portrait gets a drawn avatar (a person glyph), never a plushie. The `corpo` value marks it; the
// portrait component draws it instead of calling the plushie engine.
export const PERSON_BODY = 'pessoa'

export const isPersonSpec = (f: { corpo: string }): boolean => f.corpo === PERSON_BODY
