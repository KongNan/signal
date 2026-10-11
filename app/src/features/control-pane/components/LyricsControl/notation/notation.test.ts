import { describe, expect, it } from "vitest"
import {
  jianpuDegreeOf,
  keyInfoOf,
  keySignatureAlterations,
  staffSpellOf,
  staffStepOf,
} from "./keys"
import { layoutNotationMeasure } from "./layout"

const MAJOR = "major" as const
const MINOR = "minor" as const

describe("keyInfoOf", () => {
  it("maps C major to an open key signature", () => {
    const info = keyInfoOf(0, MAJOR)
    expect(info.fifths).toBe(0)
    expect(info.jianpuTonicPc).toBe(0)
  })

  it("maps G major to one sharp", () => {
    expect(keyInfoOf(7, MAJOR).fifths).toBe(1)
  })

  it("uses the relative major for minor keys (la-based jianpu)", () => {
    const info = keyInfoOf(9, MINOR) // A minor
    expect(info.fifths).toBe(0) // same signature as C major
    expect(info.jianpuTonicPc).toBe(0) // 1 = C
    expect(info.staffRootPc).toBe(9) // staff scale rooted at A
  })

  it("spells flat keys with flats", () => {
    expect(keyInfoOf(10, MAJOR).fifths).toBe(-2) // Bb major
  })
})

describe("jianpuDegreeOf", () => {
  const cMajor = keyInfoOf(0, MAJOR)

  it("returns the tonic without dots", () => {
    expect(jianpuDegreeOf(60, cMajor)).toEqual({
      degree: 1,
      accidental: "",
      octave: 0,
    })
  })

  it("counts scale degrees", () => {
    expect(jianpuDegreeOf(67, cMajor).degree).toBe(5) // G4 = 5
    expect(jianpuDegreeOf(64, cMajor).degree).toBe(3) // E4 = 3
  })

  it("adds dots above / below by octave", () => {
    expect(jianpuDegreeOf(72, cMajor).octave).toBe(1) // C5: one dot above
    expect(jianpuDegreeOf(59, cMajor).octave).toBe(-1) // B3: one dot below
  })

  it("spells chromatic notes with the jianpu convention", () => {
    expect(jianpuDegreeOf(66, cMajor)).toMatchObject({
      degree: 4,
      accidental: "#",
    }) // F#4 = #4
    expect(jianpuDegreeOf(70, cMajor)).toMatchObject({
      degree: 7,
      accidental: "b",
    }) // Bb4 = b7
  })
})

describe("staffSpellOf", () => {
  it("shows an accidental for notes outside the key", () => {
    const cMajor = keyInfoOf(0, MAJOR)
    const alters = new Map<number, number>()
    const fSharp = staffSpellOf(66, cMajor, alters)
    expect(fSharp.letter).toBe(3) // F
    expect(fSharp.alter).toBe(1)
    expect(fSharp.displayAccidental).toBe(1)
    // a different letter needs no natural sign
    const again = staffSpellOf(67, cMajor, alters) // G
    expect(again.displayAccidental).toBeNull()
    // the same letter back on the natural pitch needs a cancelling natural
    const fNatural = staffSpellOf(65, cMajor, alters)
    expect(fNatural.displayAccidental).toBe(0)
  })

  it("does not show accidentals for diatonic notes", () => {
    const gMajor = keyInfoOf(7, MAJOR) // one sharp (F#)
    const alters = keySignatureAlterations(gMajor.fifths)
    void alters
    const measureAlters = new Map<number, number>()
    const fSharp = staffSpellOf(66, gMajor, measureAlters)
    expect(fSharp.displayAccidental).toBeNull() // F# is in the key signature
  })

  it("tracks staff steps", () => {
    const cMajor = keyInfoOf(0, MAJOR)
    const stepE4 = staffStepOf(64, staffSpellOf(64, cMajor, new Map()))
    expect(stepE4).toBe(30) // bottom line
    const stepC4 = staffStepOf(60, staffSpellOf(60, cMajor, new Map()))
    expect(stepC4).toBe(28) // first ledger below
  })
})

describe("layoutNotationMeasure", () => {
  const base = {
    measureStart: 0,
    numerator: 4,
    denominator: 4,
    timebase: 480,
    key: 0,
    scale: MAJOR,
    pxPerBeat: 96,
    isFirst: false,
  }

  it("fills gaps between notes with rests", () => {
    const layout = layoutNotationMeasure({
      ...base,
      notes: [
        { tick: 1920, duration: 480, noteNumber: 60 }, // beat 4
      ],
    })
    // jianpu writes the 3-beat gap as one rest with dashes: "0 - -"
    const restTexts = layout.jianpu.texts.filter((t) => t.text === "0")
    expect(restTexts.length).toBe(1)
    const dashes = layout.jianpu.texts.filter((t) => t.text === "—")
    expect(dashes.length).toBeGreaterThanOrEqual(2)
    // staff: half + quarter rests before the note
    expect(layout.staff.glyphs.length).toBeGreaterThanOrEqual(2)
  })

  it("draws augmentation dashes for multi-beat notes", () => {
    const layout = layoutNotationMeasure({
      ...base,
      notes: [{ tick: 0, duration: 1440, noteNumber: 60 }], // 3 beats
    })
    const dashes = layout.jianpu.texts.filter((t) => t.text === "—")
    expect(dashes.length).toBe(2)
  })

  it("stacks chords vertically in jianpu and staff", () => {
    const layout = layoutNotationMeasure({
      ...base,
      notes: [
        { tick: 0, duration: 480, noteNumber: 60 },
        { tick: 0, duration: 480, noteNumber: 64 },
      ],
    })
    const numbers = layout.jianpu.texts.filter(
      (t) => t.text !== "·" && t.text !== "—" && t.text !== "0",
    )
    expect(numbers.length).toBe(2)
    const ys = numbers.map((t) => t.y)
    expect(ys[0]).not.toBe(ys[1])
    expect(layout.staff.glyphs.length).toBeGreaterThanOrEqual(2)
  })

  it("draws the clef, key signature and time signature on the first measure", () => {
    const layout = layoutNotationMeasure({
      ...base,
      isFirst: true,
      notes: [],
    })
    const clef = layout.staff.glyphs[0]
    expect(clef.code).toBe(0xe050)
    expect(layout.leadPx).toBeGreaterThan(0)
  })

  it("aligns the barline with the measure width", () => {
    const layout = layoutNotationMeasure({ ...base, notes: [] })
    const barline = layout.staff.lines[layout.staff.lines.length - 1]
    expect(barline?.x1).toBe(4 * 96)
  })
})
