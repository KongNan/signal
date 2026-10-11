// SMuFL glyph codepoints (Bravura) and the font registration for the
// notation strip. Font files come from dolce's redist (MIT, SMuFL license).

export const SMUFL = {
  gClef: 0xe050,
  timeSig0: 0xe080, // ..0xe089
  noteheadWhole: 0xe0a2,
  noteheadHalf: 0xe0a3,
  noteheadBlack: 0xe0a4,
  augmentationDot: 0xe1e7,
  flag8thUp: 0xe240,
  flag16thUp: 0xe242,
  flag8thDown: 0xe241,
  flag16thDown: 0xe243,
  restWhole: 0xe4e2,
  restHalf: 0xe4e3,
  restQuarter: 0xe4e5,
  rest8th: 0xe4e6,
  rest16th: 0xe4e7,
  accidentalSharp: 0xe262,
  accidentalFlat: 0xe260,
  accidentalNatural: 0xe261,
} as const

/** Glyph advance widths / offsets in staff spaces (Bravura, measured). */
export const GLYPH_METRICS = {
  noteheadWidth: 1.18, // advance of black/half noteheads
  stemLength: 3.5,
  accidentalWidth: 1.0,
  restWidth: 1.4,
} as const

let fontPromise: Promise<void> | null = null

/** Register the Bravura font faces once (FontFace API). */
export const ensureBravuraFont = (): Promise<void> => {
  if (fontPromise === null) {
    fontPromise = (async () => {
      if (typeof FontFace === "undefined") {
        return
      }
      const faces = [
        new FontFace("Bravura", `url(Bravura.woff2) format("woff2")`),
      ]
      await Promise.all(faces.map((face) => face.load()))
      for (const face of faces) {
        document.fonts.add(face)
      }
    })().catch(() => {
      // render with fallback glyphs if the font is unavailable
    })
  }
  return fontPromise
}
