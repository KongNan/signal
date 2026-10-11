import { Scale } from "./Scale"

export interface KeySignature {
  readonly key: number // 0 is C, 1 is C#, 2 is D, etc.
  readonly scale: Scale
}

export namespace KeySignature {
  // the function that transpose the scale to the key
  export const getIntervals = (keySignature: KeySignature): number[] => {
    const scaleIntervals = Scale.getIntegerNotation(keySignature.scale)
    return scaleIntervals.map((i) => (i + keySignature.key) % 12)
  }

  const MINOR_SCALES: ReadonlySet<string> = new Set([
    "minor",
    "harmonicMinor",
    "melodicMinor",
    "aeolian",
    "minorPentatonic",
  ])

  export const isMinorScaleName = (scale: string): boolean =>
    MINOR_SCALES.has(scale)

  // chromatic key -> circle-of-fifths count for the (default-spelled) major key
  const MAJOR_FIFTHS = [0, 7, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5]

  /** Key signature size: + = sharps, - = flats (circle of fifths). */
  export const fifthsOf = (keySignature: KeySignature): number => {
    const pc = ((keySignature.key % 12) + 12) % 12
    const majorPc = isMinorScaleName(keySignature.scale) ? (pc + 3) % 12 : pc
    return MAJOR_FIFTHS[majorPc]
  }

  /** MIDI keySignature meta "sf" (fifths) -> chromatic pitch class of the major key. */
  export const fifthsToKey = (fifths: number): number =>
    ((((fifths * 7) % 12) + 12) % 12) as number

  /** Chromatic pitch class -> MIDI keySignature meta "sf" (fifths). */
  export const keyToFifths = (pc: number): number =>
    MAJOR_FIFTHS[((pc % 12) + 12) % 12]

  /** Build a KeySignature from a MIDI keySignature meta event's fields. */
  export const fromMidiValues = (sf: number, mi: number): KeySignature => {
    const majorPc = fifthsToKey(sf)
    const minor = mi === 1
    return {
      key: minor ? (majorPc + 9) % 12 : majorPc,
      scale: minor ? "minor" : "major",
    }
  }
}
