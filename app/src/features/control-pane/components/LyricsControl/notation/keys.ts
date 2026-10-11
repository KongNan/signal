import type { Scale } from "../../../../../entities/scale/Scale"

// Key / spelling utilities for the notation strip.
//
// Jianpu (numbered notation) is movable-do: degrees are counted from the
// tonic of the RELATIVE MAJOR ("1"); minor keys are la-based (6 = minor
// tonic). Staff spelling follows the key's own major/minor scale, with
// chromatic notes spelled sharp-side on sharp keys and flat-side on flat
// keys.

export interface KeyInfo {
  /** Key signature size: + = sharps, - = flats (circle of fifths). */
  readonly fifths: number
  /** Pitch class of the movable-do tonic ("1"). */
  readonly jianpuTonicPc: number
  /** Root pitch class of the staff scale. */
  readonly staffRootPc: number
  /** Whether the staff scale is minor. */
  readonly minor: boolean
}

const MINOR_SCALES: ReadonlySet<string> = new Set([
  "minor",
  "harmonicMinor",
  "melodicMinor",
  "aeolian",
  "minorPentatonic",
])

// chromatic key -> circle-of-fifths count for the (default-spelled) major key
const MAJOR_FIFTHS = [0, 7, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5]

export const keyInfoOf = (key: number, scale: Scale | null): KeyInfo => {
  const minor = scale !== null && MINOR_SCALES.has(scale)
  const pc = ((key % 12) + 12) % 12
  const majorPc = minor ? (pc + 3) % 12 : pc
  return {
    fifths: MAJOR_FIFTHS[majorPc],
    jianpuTonicPc: majorPc,
    staffRootPc: pc,
    minor,
  }
}

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11]
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10]

// chromatic offset from the jianpu tonic -> jianpu degree + accidental.
// Convention: flat-side spellings except the tritone (#4).
const OFFSET_TO_DEGREE: ReadonlyArray<readonly [number, string]> = [
  [1, ""],
  [2, "b"],
  [2, ""],
  [3, "b"],
  [3, ""],
  [4, ""],
  [4, "#"],
  [5, ""],
  [6, "b"],
  [6, ""],
  [7, "b"],
  [7, ""],
]

export interface JianpuDegree {
  readonly degree: number
  readonly accidental: "" | "#" | "b"
  /** 0 = central octave (no dots), +1 = one dot above, -1 = one dot below. */
  readonly octave: number
}

export const jianpuDegreeOf = (
  midi: number,
  keyInfo: KeyInfo,
): JianpuDegree => {
  const tonicMidi = keyInfo.jianpuTonicPc + 60
  const rel = midi - tonicMidi
  const octave = Math.floor(rel / 12)
  const off = rel - octave * 12
  const [degree, accidental] = OFFSET_TO_DEGREE[off]
  return { degree, accidental: accidental as "" | "#" | "b", octave }
}

// ---------------------------------------------------------------- staff side

/** Natural pitch class of the letters C D E F G A B. */
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]

/** Root letter index (C=0..B=6) for a chromatic key, default spelling. */
const ROOT_LETTER = [0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6]

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] // B E A D G C F

/** Letter alterations established by the key signature itself. */
export const keySignatureAlterations = (
  fifths: number,
): Map<number, number> => {
  const map = new Map<number, number>()
  if (fifths > 0) {
    for (let i = 0; i < Math.min(fifths, 7); i++) {
      map.set(SHARP_ORDER[i], 1)
    }
  } else if (fifths < 0) {
    for (let i = 0; i < Math.min(-fifths, 7); i++) {
      map.set(FLAT_ORDER[i], -1)
    }
  }
  return map
}

export interface StaffSpelling {
  /** 0 = C .. 6 = B */
  readonly letter: number
  /** -1 flat, 0 natural, +1 sharp (relative to the natural letter) */
  readonly alter: number
  /** The accidental to display at this point in the measure, resolved
   * against the key signature and earlier accidentals; null = none. */
  readonly displayAccidental: -1 | 0 | 1 | null
}

/**
 * Spell a note for the staff and decide whether an accidental glyph is
 * needed. `measureAlters` tracks alterations already applied in the measure
 * (letter -> alter); it is mutated in note order.
 */
export const staffSpellOf = (
  midi: number,
  keyInfo: KeyInfo,
  measureAlters: Map<number, number>,
): StaffSpelling => {
  const pc = ((midi % 12) + 12) % 12
  const intervals = keyInfo.minor ? MINOR_INTERVALS : MAJOR_INTERVALS
  const rootLetter = ROOT_LETTER[keyInfo.staffRootPc]

  // spelling of each scale pitch class (letters of the key's scale)
  const scaleLetterForPc = new Map<number, number>()
  intervals.forEach((iv, d) => {
    const letter = (rootLetter + d) % 7
    const scalePc = (keyInfo.staffRootPc + iv) % 12
    if (!scaleLetterForPc.has(scalePc)) {
      scaleLetterForPc.set(scalePc, letter)
    }
  })

  // candidate letters within +/-1 semitone of the natural pitch
  const candidates: { letter: number; alter: number }[] = []
  for (let letter = 0; letter < 7; letter++) {
    const raw = (((pc - LETTER_PC[letter]) % 12) + 12) % 12
    const alter = raw > 6 ? raw - 12 : raw
    if (Math.abs(alter) <= 1) {
      candidates.push({ letter, alter })
    }
  }

  const scaleLetter = scaleLetterForPc.get(pc)
  const chosen = (scaleLetter !== undefined
    ? candidates.find((c) => c.letter === scaleLetter)
    : undefined) ??
    candidates.find((c) => c.alter === 0) ??
    candidates.find((c) => c.alter === (keyInfo.fifths >= 0 ? 1 : -1)) ??
    candidates[0] ?? { letter: rootLetter, alter: 0 }

  const keyAlter =
    keySignatureAlterations(keyInfo.fifths).get(chosen.letter) ?? 0
  const current = measureAlters.get(chosen.letter) ?? keyAlter
  const displayAccidental =
    chosen.alter === current ? null : (chosen.alter as -1 | 0 | 1)
  if (displayAccidental !== null) {
    measureAlters.set(chosen.letter, chosen.alter)
  }
  return { letter: chosen.letter, alter: chosen.alter, displayAccidental }
}

/** Diatonic staff step of a spelled note: letter + 7 * (scientific octave). */
export const staffStepOf = (midi: number, spelling: StaffSpelling): number => {
  const octave = Math.floor(midi / 12) - 1
  return spelling.letter + 7 * octave
}
