import { describe, expect, it } from "vitest"
import { KeySignature } from "../../../../../entities/scale/KeySignature"
import {
  jianpuDegreeOf,
  keyInfoOf,
  keySignatureAlterations,
  staffSpellOf,
  staffStepOf,
} from "./keys"
import { chooseClef, layoutNotationMeasure, ledgerExtents } from "./layout"

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

  it("draws measure chunks without the clef (it lives in the header cell)", () => {
    const layout = layoutNotationMeasure({ ...base, notes: [] })
    // an empty measure holds a whole rest, but no clef/key/time glyphs
    expect(layout.staff.glyphs.filter((g) => g.code === 0xe050).length).toBe(0)
  })

  it("aligns the barline with the measure width", () => {
    const layout = layoutNotationMeasure({ ...base, notes: [] })
    const barline = layout.staff.lines[layout.staff.lines.length - 1]
    expect(barline?.x1).toBe(4 * 96)
  })

  it("draws ledger lines for notes beyond the staff", () => {
    const layout = layoutNotationMeasure({
      ...base,
      notes: [{ tick: 0, duration: 480, noteNumber: 48 }], // C3 in treble
    })
    // C3 is 4 diatonic steps below the bottom line -> 4 ledger lines
    const staffBottom = 28 + 4 * 7
    const ledgerLines = layout.staff.lines.filter(
      (l) => l.y1 === l.y2 && l.y1 > staffBottom,
    )
    expect(ledgerLines.length).toBe(4) // C4 A3 F3 D3
  })

  it("shifts lanes down when ledger room is needed above", () => {
    const note = { tick: 0, duration: 480, noteNumber: 72 } // C5
    const unshifted = layoutNotationMeasure({ ...base, notes: [note] })
    const shifted = layoutNotationMeasure({
      ...base,
      notes: [note],
      yShift: 10.5,
    })
    // the first staff line and the jianpu numbers move down by yShift
    expect(shifted.staff.lines[0].y1).toBe(unshifted.staff.lines[0].y1 + 10.5)
    expect(shifted.jianpu.texts[0].y).toBe(unshifted.jianpu.texts[0].y + 10.5)
  })
})

describe("clef choice and strip growth", () => {
  it("chooses bass clef for low melodies", () => {
    // C3-G3: 4 ledger lines in treble, none in bass
    expect(chooseClef(48, 55)).toBe("bass")
  })

  it("chooses treble clef for mid/high melodies", () => {
    expect(chooseClef(60, 72)).toBe("treble")
    expect(chooseClef(64, 81)).toBe("treble")
  })

  it("computes ledger extents", () => {
    // C4 one ledger below the treble staff; C6 two ledgers above the top
    expect(ledgerExtents(60, 84, "treble")).toEqual({ above: 2, below: 1 })
    // C3-G3 sits inside the bass staff
    expect(ledgerExtents(48, 55, "bass")).toEqual({ above: 0, below: 0 })
  })
})

describe("key signature round trip", () => {
  it("converts between fifths and chromatic keys", () => {
    expect(KeySignature.keyToFifths(7)).toBe(1) // G major: one sharp
    expect(KeySignature.fifthsToKey(1)).toBe(7)
    expect(KeySignature.fifthsToKey(-1)).toBe(5) // F major
    expect(KeySignature.fifthsToKey(-3)).toBe(3) // Eb major
    // the chromatic-pc representation covers every key within sf -4..+7
    // (Db/Gb/Cb collapse into C#/F#/B, matching the dialog's sharp-side names)
    for (let sf = -4; sf <= 7; sf++) {
      expect(KeySignature.keyToFifths(KeySignature.fifthsToKey(sf))).toBe(sf)
    }
  })

  it("builds minor keys from the MIDI minor flag", () => {
    // sf 0 + minor flag = A minor
    expect(KeySignature.fromMidiValues(0, 1)).toEqual({
      key: 9,
      scale: "minor",
    })
    expect(KeySignature.fromMidiValues(0, 0)).toEqual({
      key: 0,
      scale: "major",
    })
  })
})

describe("jianpu accidental rendering", () => {
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

  it("renders the accidental as its own glyph before the digit", () => {
    const layout = layoutNotationMeasure({
      ...base,
      notes: [{ tick: 0, duration: 480, noteNumber: 66 }], // F#4 = #4
    })
    const acc = layout.jianpu.texts.find((t) => t.text === "♯")
    const digit = layout.jianpu.texts.find((t) => t.text === "4")
    expect(acc).toBeDefined()
    expect(digit).toBeDefined()
    expect(digit!.x).toBeGreaterThan(acc!.x)
  })

  it("draws the underline under the digit, not the accidental", () => {
    const layout = layoutNotationMeasure({
      ...base,
      notes: [{ tick: 0, duration: 240, noteNumber: 66 }], // #4, 16th
    })
    const digit = layout.jianpu.texts.find((t) => t.text === "4")
    const underline = layout.jianpu.lines[0]
    expect(underline.x1).toBeGreaterThanOrEqual(digit!.x - 2)
  })
})

describe("sustained notes across barlines", () => {
  const base = {
    measureStart: 1920, // second measure
    numerator: 4,
    denominator: 4,
    timebase: 480,
    key: 0,
    scale: MAJOR,
    pxPerBeat: 96,
    isFirst: false,
  }

  it("does not fill a rest where a previous note still sounds", () => {
    const layout = layoutNotationMeasure({
      ...base,
      notes: [{ tick: 2400, duration: 480, noteNumber: 60 }], // beat 2 of the measure
      carriedUntil: 2400, // previous note sounds until beat 2
    })
    // no leading rest: the first jianpu text is the note itself
    expect(layout.jianpu.texts[0].text).toBe("1")
    // the trailing half of the measure still gets its rest
    expect(layout.jianpu.texts.some((t) => t.text === "0")).toBe(true)
  })

  it("starts rests after the sustained part", () => {
    const layout = layoutNotationMeasure({
      ...base,
      notes: [{ tick: 2880, duration: 480, noteNumber: 60 }], // beat 3
      carriedUntil: 2400, // previous note sounds until beat 2
    })
    const rest = layout.jianpu.texts.find((t) => t.text === "0")
    expect(rest).toBeDefined()
    // rest starts at the carried tick (beat 2), not at the measure start
    expect(rest!.x).toBeCloseTo(96, 0)
  })
})
