import { GLYPH_METRICS, SMUFL } from "./bravura"
import {
  jianpuDegreeOf,
  type KeyInfo,
  keyInfoOf,
  staffSpellOf,
  staffStepOf,
} from "./keys"

// Notation strip layout for one measure: a staff lane (treble) and a jianpu
// lane, both laid out in TICK space so chunks align exactly with the piano
// roll grid. Horizontal spacing is proportional within beats (pxPerBeat);
// vertical metrics are fixed screen pixels so glyphs stay readable at any
// zoom (the component scales chunks horizontally only).

export interface NoteLike {
  readonly tick: number
  readonly duration: number
  readonly noteNumber: number
}

export interface NotationGlyph {
  readonly code: number
  readonly x: number
  readonly y: number
}
export interface NotationText {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly anchor: "start" | "middle"
}
export interface NotationLine {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly width: number
}
export interface NotationDot {
  readonly x: number
  readonly y: number
  readonly r: number
}
export interface NotationLanes {
  glyphs: NotationGlyph[]
  texts: NotationText[]
  lines: NotationLine[]
  dots: NotationDot[]
}

export interface NotationMeasureLayout {
  readonly startTick: number
  readonly durationTicks: number
  readonly pxPerBeat: number
  /** Extra reference px to the LEFT of the measure (clef/key/time sig). */
  readonly leadPx: number
  readonly widthPx: number
  readonly staff: NotationLanes
  readonly jianpu: NotationLanes
}

// vertical metrics (fixed screen px)
export const STAFF_TOP = 10
export const STAFF_SPACE = 7
export const STAFF_FONT_SIZE = STAFF_SPACE * 4
export const JIANPU_BASELINE = 64
export const JIANPU_FONT_SIZE = 17
export const JIANPU_NUMBER_WIDTH = JIANPU_FONT_SIZE * 0.62
export const STRIP_HEIGHT = 84

const BOTTOM_LINE_Y = STAFF_TOP + STAFF_SPACE * 4
const MIDDLE_LINE_Y = STAFF_TOP + STAFF_SPACE * 2
const STAFF_STEP = STAFF_SPACE / 2

const stepToY = (step: number) => BOTTOM_LINE_Y - (step - 30) * STAFF_STEP

// key-signature accidental vertical positions (treble clef, staff steps)
const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34] // F5 C5 G5 D5 A4 E5 B4
const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31] // B4 E5 A4 D5 G4 C5 F4

const durationBeats = (duration: number, tpb: number) => duration / tpb

// ---------------------------------------------------------------- staff lane

const addStaffNote = (
  glyphs: NotationGlyph[],
  lines: NotationLine[],
  dots: NotationDot[],
  note: NoteLike,
  x: number,
  beats: number,
  keyInfo: KeyInfo,
  measureAlters: Map<number, number>,
) => {
  const spelling = staffSpellOf(note.noteNumber, keyInfo, measureAlters)
  const step = staffStepOf(note.noteNumber, spelling)
  const y = stepToY(step)
  const stemUp = step < 34 // below the middle line (B4) stems go up
  const nw = GLYPH_METRICS.noteheadWidth * STAFF_SPACE

  if (spelling.displayAccidental !== null) {
    const code =
      spelling.displayAccidental === 1
        ? SMUFL.accidentalSharp
        : spelling.displayAccidental === -1
          ? SMUFL.accidentalFlat
          : SMUFL.accidentalNatural
    glyphs.push({
      code,
      x: x - GLYPH_METRICS.accidentalWidth * STAFF_SPACE,
      y,
    })
  }

  const dotted = beats % 1 >= 0.4
  if (beats >= 3.9) {
    glyphs.push({ code: SMUFL.noteheadWhole, x, y })
  } else {
    glyphs.push({
      code: beats >= 1.9 ? SMUFL.noteheadHalf : SMUFL.noteheadBlack,
      x,
      y,
    })
    const stemX = stemUp ? x + nw : x
    const stemEnd = stemUp
      ? y - GLYPH_METRICS.stemLength * STAFF_SPACE
      : y + GLYPH_METRICS.stemLength * STAFF_SPACE
    lines.push({ x1: stemX, y1: y, x2: stemX, y2: stemEnd, width: 1 })
    if (beats < 0.95) {
      const flagCode =
        beats < 0.3
          ? stemUp
            ? SMUFL.flag16thUp
            : SMUFL.flag16thDown
          : stemUp
            ? SMUFL.flag8thUp
            : SMUFL.flag8thDown
      glyphs.push({ code: flagCode, x: stemX, y: stemEnd })
    }
  }
  if (dotted) {
    dots.push({
      x: x + nw + STAFF_SPACE * 0.45,
      y: step % 2 === 0 ? y - STAFF_STEP : y,
      r: STAFF_SPACE * 0.14,
    })
  }
}

const addStaffRest = (glyphs: NotationGlyph[], beats: number, x: number) => {
  let remaining = beats
  let rx = x
  const advance = GLYPH_METRICS.restWidth * STAFF_SPACE
  while (remaining >= 3.9) {
    glyphs.push({ code: SMUFL.restWhole, x: rx, y: STAFF_TOP + STAFF_SPACE })
    rx += advance
    remaining -= 4
  }
  if (remaining >= 1.9) {
    glyphs.push({ code: SMUFL.restHalf, x: rx, y: MIDDLE_LINE_Y })
    rx += advance
    remaining -= 2
  }
  while (remaining >= 0.95) {
    glyphs.push({ code: SMUFL.restQuarter, x: rx, y: MIDDLE_LINE_Y })
    rx += advance * 0.8
    remaining -= 1
  }
  while (remaining >= 0.45) {
    glyphs.push({ code: SMUFL.rest8th, x: rx, y: MIDDLE_LINE_Y })
    rx += advance * 0.65
    remaining -= 0.5
  }
  while (remaining >= 0.2) {
    glyphs.push({ code: SMUFL.rest16th, x: rx, y: MIDDLE_LINE_Y })
    rx += advance * 0.55
    remaining -= 0.25
  }
}

const groupChords = (notes: readonly NoteLike[]) => {
  const sorted = [...notes].sort((a, b) => a.tick - b.tick)
  const chords: { tick: number; notes: NoteLike[] }[] = []
  for (const note of sorted) {
    const last = chords[chords.length - 1]
    if (last !== undefined && last.tick === note.tick) {
      last.notes.push(note)
    } else {
      chords.push({ tick: note.tick, notes: [note] })
    }
  }
  return chords
}

const layoutStaffLane = (
  lanes: NotationLanes,
  params: {
    measureStart: number
    numerator: number
    denominator: number
    timebase: number
    pxPerBeat: number
    notes: readonly NoteLike[]
    keyInfo: KeyInfo
    isFirst: boolean
  },
) => {
  const {
    measureStart,
    numerator,
    denominator,
    timebase,
    pxPerBeat,
    notes,
    keyInfo,
    isFirst,
  } = params
  const tpb = (timebase * 4) / denominator
  const widthPx = numerator * pxPerBeat
  const xOf = (tick: number) => ((tick - measureStart) / tpb) * pxPerBeat

  for (let i = 0; i < 5; i++) {
    const y = STAFF_TOP + i * STAFF_SPACE
    lanes.lines.push({ x1: 0, y1: y, x2: widthPx, y2: y, width: 1 })
  }

  let lead = 0
  if (isFirst) {
    lanes.glyphs.push({
      code: SMUFL.gClef,
      x: 4,
      y: BOTTOM_LINE_Y - STAFF_SPACE,
    })
    lead = 2.6 * STAFF_SPACE
    if (keyInfo.fifths !== 0) {
      const steps = keyInfo.fifths > 0 ? SHARP_STEPS : FLAT_STEPS
      const code =
        keyInfo.fifths > 0 ? SMUFL.accidentalSharp : SMUFL.accidentalFlat
      const count = Math.min(Math.abs(keyInfo.fifths), 7)
      for (let i = 0; i < count; i++) {
        lanes.glyphs.push({ code, x: lead, y: stepToY(steps[i]) })
        lead += STAFF_SPACE * 0.9
      }
      lead += STAFF_SPACE * 0.4
    }
    const digitsOf = (n: number) =>
      String(n)
        .split("")
        .map((d) => SMUFL.timeSig0 + Number(d))
    let tx = lead
    for (const code of digitsOf(numerator)) {
      lanes.glyphs.push({ code, x: tx, y: MIDDLE_LINE_Y })
      tx += STAFF_SPACE * 1.7
    }
    tx += STAFF_SPACE * 0.4
    for (const code of digitsOf(denominator)) {
      lanes.glyphs.push({ code, x: tx, y: MIDDLE_LINE_Y })
      tx += STAFF_SPACE * 1.7
    }
    lead = tx + STAFF_SPACE * 0.6
  }

  const measureAlters = new Map<number, number>()
  const measureEndTick = measureStart + tpb * numerator
  let prevEndTick = measureStart
  for (const chord of groupChords(notes)) {
    const gap = chord.tick - prevEndTick
    if (gap >= tpb * 0.2) {
      addStaffRest(lanes.glyphs, durationBeats(gap, tpb), xOf(prevEndTick))
    }
    const beats = durationBeats(
      Math.max(...chord.notes.map((n) => n.duration)),
      tpb,
    )
    const x = xOf(chord.tick)
    for (const note of [...chord.notes].sort(
      (a, b) => b.noteNumber - a.noteNumber,
    )) {
      addStaffNote(
        lanes.glyphs,
        lanes.lines,
        lanes.dots,
        note,
        x,
        beats,
        keyInfo,
        measureAlters,
      )
    }
    const chordEnd = Math.min(
      chord.tick + Math.max(...chord.notes.map((n) => n.duration)),
      measureEndTick,
    )
    prevEndTick = Math.max(prevEndTick, chordEnd)
  }
  const trailing = measureEndTick - prevEndTick
  if (trailing >= tpb * 0.2) {
    addStaffRest(lanes.glyphs, durationBeats(trailing, tpb), xOf(prevEndTick))
  }

  lanes.lines.push({
    x1: widthPx,
    y1: STAFF_TOP,
    x2: widthPx,
    y2: BOTTOM_LINE_Y,
    width: 1,
  })
  return { widthPx, lead }
}

// --------------------------------------------------------------- jianpu lane

const JIANPU_UNDERLINE_Y = 71

const jianpuDurationMarks = (
  texts: NotationText[],
  lines: NotationLine[],
  beats: number,
  noteTick: number,
  noteX: number,
  tpb: number,
  xOf: (tick: number) => number,
) => {
  const intB = Math.floor(beats + 1e-6)
  const frac = beats - intB
  // augmentation dashes sit on the beats that follow the note
  for (let k = 1; k < intB; k++) {
    texts.push({
      text: "—",
      x: xOf(noteTick + k * tpb) + JIANPU_NUMBER_WIDTH / 2,
      y: JIANPU_BASELINE,
      anchor: "middle",
    })
  }
  let underlines = 0
  let dot = false
  if (intB === 0) {
    if (frac < 0.3) {
      underlines = frac >= 0.05 ? 2 : 0
    } else {
      underlines = 1
      dot = frac >= 0.65
    }
  } else if (frac >= 0.45) {
    dot = true
  } else if (frac >= 0.2) {
    underlines = 2
  }
  for (let i = 0; i < underlines; i++) {
    lines.push({
      x1: noteX - 2,
      y1: JIANPU_UNDERLINE_Y + i * 3,
      x2: noteX + JIANPU_NUMBER_WIDTH + 2,
      y2: JIANPU_UNDERLINE_Y + i * 3,
      width: 1.2,
    })
  }
  if (dot) {
    texts.push({
      text: "·",
      x: noteX + JIANPU_NUMBER_WIDTH + JIANPU_FONT_SIZE * 0.3,
      y: JIANPU_BASELINE,
      anchor: "middle",
    })
  }
  return { underlines }
}

const addJianpuChord = (
  texts: NotationText[],
  lines: NotationLine[],
  dots: NotationDot[],
  chordNotes: readonly NoteLike[],
  beats: number,
  noteTick: number,
  noteX: number,
  chordTpb: number,
  keyInfo: KeyInfo,
  xOf: (tick: number) => number,
) => {
  const isRest = chordNotes.some((n) => n.noteNumber < 0)
  const ordered = [...chordNotes].sort((a, b) => b.noteNumber - a.noteNumber)
  const dy = JIANPU_FONT_SIZE * 0.95

  ordered.forEach((note, i) => {
    const baseline = JIANPU_BASELINE - (ordered.length - 1 - i) * dy
    if (isRest) {
      texts.push({ text: "0", x: noteX, y: baseline, anchor: "start" })
      return
    }
    const deg = jianpuDegreeOf(note.noteNumber, keyInfo)
    texts.push({
      text: `${deg.accidental}${deg.degree}`,
      x: noteX,
      y: baseline,
      anchor: "start",
    })
    if (deg.octave > 0) {
      for (let k = 0; k < deg.octave; k++) {
        dots.push({
          x: noteX + JIANPU_NUMBER_WIDTH / 2,
          y: baseline - JIANPU_FONT_SIZE - 3 - k * 3.5,
          r: 1.6,
        })
      }
    }
  })

  const marks = jianpuDurationMarks(
    texts,
    lines,
    beats,
    noteTick,
    noteX,
    chordTpb,
    xOf,
  )

  if (!isRest) {
    ordered.forEach((note) => {
      const deg = jianpuDegreeOf(note.noteNumber, keyInfo)
      if (deg.octave < 0) {
        for (let k = 0; k < -deg.octave; k++) {
          dots.push({
            x: noteX + JIANPU_NUMBER_WIDTH / 2,
            y: JIANPU_UNDERLINE_Y + marks.underlines * 3 + 5 + k * 3.5,
            r: 1.6,
          })
        }
      }
    })
  }
}

const layoutJianpuLane = (
  lanes: NotationLanes,
  params: {
    measureStart: number
    numerator: number
    denominator: number
    timebase: number
    pxPerBeat: number
    notes: readonly NoteLike[]
    keyInfo: KeyInfo
  },
) => {
  const {
    measureStart,
    numerator,
    denominator,
    timebase,
    pxPerBeat,
    notes,
    keyInfo,
  } = params
  const tpb = (timebase * 4) / denominator
  const widthPx = numerator * pxPerBeat
  const xOf = (tick: number) => ((tick - measureStart) / tpb) * pxPerBeat
  const measureEndTick = measureStart + tpb * numerator

  let prevEndTick = measureStart
  for (const chord of groupChords(notes)) {
    const gap = chord.tick - prevEndTick
    if (gap >= tpb * 0.2) {
      addJianpuChord(
        lanes.texts,
        lanes.lines,
        lanes.dots,
        [{ tick: prevEndTick, duration: gap, noteNumber: -1 }],
        durationBeats(gap, tpb),
        prevEndTick,
        xOf(prevEndTick),
        tpb,
        keyInfo,
        xOf,
      )
    }
    const beats = durationBeats(
      Math.max(...chord.notes.map((n) => n.duration)),
      tpb,
    )
    addJianpuChord(
      lanes.texts,
      lanes.lines,
      lanes.dots,
      chord.notes,
      beats,
      chord.tick,
      xOf(chord.tick),
      tpb,
      keyInfo,
      xOf,
    )
    const chordEnd = Math.min(
      chord.tick + Math.max(...chord.notes.map((n) => n.duration)),
      measureEndTick,
    )
    prevEndTick = Math.max(prevEndTick, chordEnd)
  }
  const trailing = measureEndTick - prevEndTick
  if (trailing >= tpb * 0.2) {
    addJianpuChord(
      lanes.texts,
      lanes.lines,
      lanes.dots,
      [{ tick: prevEndTick, duration: trailing, noteNumber: -1 }],
      durationBeats(trailing, tpb),
      prevEndTick,
      xOf(prevEndTick),
      tpb,
      keyInfo,
      xOf,
    )
  }

  lanes.lines.push({
    x1: widthPx,
    y1: JIANPU_BASELINE - JIANPU_FONT_SIZE - 4,
    x2: widthPx,
    y2: JIANPU_BASELINE + 8,
    width: 1.2,
  })
}

// ------------------------------------------------------------------ assemble

const KEY_NAMES = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
]

export const jianpuKeyLabel = (keyInfo: KeyInfo): string =>
  `1=${KEY_NAMES[keyInfo.jianpuTonicPc]}`

export const layoutNotationMeasure = (params: {
  measureStart: number
  numerator: number
  denominator: number
  timebase: number
  notes: readonly NoteLike[]
  key: number
  scale: string | null
  pxPerBeat: number
  isFirst: boolean
}): NotationMeasureLayout => {
  const keyInfo = keyInfoOf(params.key, params.scale as never)
  const laneParams = { ...params, keyInfo }
  const staff: NotationLanes = { glyphs: [], texts: [], lines: [], dots: [] }
  const jianpu: NotationLanes = { glyphs: [], texts: [], lines: [], dots: [] }

  const staffResult = layoutStaffLane(staff, laneParams)
  layoutJianpuLane(jianpu, laneParams)

  const tpb = (params.timebase * 4) / params.denominator
  return {
    startTick: params.measureStart,
    durationTicks: tpb * params.numerator,
    pxPerBeat: params.pxPerBeat,
    leadPx: params.isFirst ? staffResult.lead : 0,
    widthPx: staffResult.widthPx,
    staff,
    jianpu,
  }
}
