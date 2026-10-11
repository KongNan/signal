import { Measure } from "@signal-app/core"
import { GLYPH_METRICS, SMUFL } from "./bravura"
import {
  jianpuDegreeOf,
  type KeyInfo,
  keyInfoOf,
  staffSpellOf,
  staffStepOf,
} from "./keys"

// Notation strip layout for one measure: a staff lane and a jianpu lane,
// both laid out in TICK space so chunks align exactly with the piano roll
// grid. Horizontal spacing is proportional within beats (pxPerBeat);
// vertical metrics are fixed screen pixels so glyphs stay readable at any
// zoom (the component scales chunks horizontally only).
//
// The staff uses treble or bass clef (chosen by ledger-line cost, the
// standard engraving answer to register extremes); notes beyond the staff
// get ledger lines, and the strip grows vertically to fit them (yShift).

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
  /** font size override (px) — falls back to the lane default */
  readonly size?: number
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
  readonly widthPx: number
  readonly staff: NotationLanes
  readonly jianpu: NotationLanes
}

// vertical metrics (fixed screen px, at yShift 0).
// The staff sits in the MIDDLE third of a three-staff-tall region: one
// staff height of headroom above and below absorbs ledger notes without
// any dynamic resizing (the clef choice keeps extreme registers rare).
export const STAFF_TOP = 38 // 10 + one staff height (28)
export const STAFF_SPACE = 7
export const STAFF_FONT_SIZE = STAFF_SPACE * 4
export const JIANPU_BASELINE = 92 // 64 + 28
export const JIANPU_FONT_SIZE = 17
export const JIANPU_NUMBER_WIDTH = JIANPU_FONT_SIZE * 0.62
export const STRIP_HEIGHT = 112 // 84 + 28

const STAFF_STEP = STAFF_SPACE / 2

export type Clef = "treble" | "bass"

const CLEF_DATA: Record<
  Clef,
  {
    bottomStep: number
    glyph: number
    glyphStep: number
    sharps: number[]
    flats: number[]
  }
> = {
  treble: {
    bottomStep: 30, // E4 on the bottom line
    glyph: SMUFL.gClef,
    glyphStep: 32, // G4 line
    sharps: [38, 35, 39, 36, 33, 37, 34], // F5 C5 G5 D5 A4 E5 B4
    flats: [34, 37, 33, 36, 32, 35, 31], // B4 E5 A4 D5 G4 C5 F4
  },
  bass: {
    bottomStep: 18, // G2 on the bottom line
    glyph: SMUFL.fClef,
    glyphStep: 24, // F3 line
    sharps: [24, 21, 25, 22, 19, 23, 20], // F3 C3 G3 D3 A2 E3 B2
    flats: [20, 23, 19, 22, 25, 21, 24], // B2 E3 A2 D3 G3 C3 F3
  },
}

// approximate diatonic step of a midi note (letter only, for clef choice /
// extent sizing; exact drawing uses the real spelling)
const APPROX_LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const approxStepOf = (midi: number) => {
  const pc = ((midi % 12) + 12) % 12
  return APPROX_LETTER[pc] + 7 * (Math.floor(midi / 12) - 1)
}

/** Ledger lines needed beyond the staff for a pitch range. */
export const ledgerExtents = (
  minMidi: number,
  maxMidi: number,
  clef: Clef,
): { above: number; below: number } => {
  const cd = CLEF_DATA[clef]
  const topStep = cd.bottomStep + 8
  const below = Math.max(
    0,
    Math.floor((cd.bottomStep - approxStepOf(minMidi)) / 2),
  )
  const above = Math.max(0, Math.floor((approxStepOf(maxMidi) - topStep) / 2))
  return { above, below }
}

/** Pick the clef that needs fewer ledger lines for the pitch range. */
export const chooseClef = (minMidi: number, maxMidi: number): Clef => {
  if (!Number.isFinite(minMidi) || !Number.isFinite(maxMidi)) {
    return "treble"
  }
  const treble = ledgerExtents(minMidi, maxMidi, "treble")
  const bass = ledgerExtents(minMidi, maxMidi, "bass")
  return bass.above + bass.below < treble.above + treble.below
    ? "bass"
    : "treble"
}

const durationBeats = (duration: number, tpb: number) => duration / tpb

// ---------------------------------------------------------------- staff lane

interface StaffContext {
  bottomStep: number
  topStep: number
  stepToY: (step: number) => number
  middleLineY: number
  staffTopY: number
}

const addStaffNote = (
  v: NotationLanes,
  ctx: StaffContext,
  note: NoteLike,
  x: number,
  beats: number,
  keyInfo: KeyInfo,
  measureAlters: Map<number, number>,
) => {
  const spelling = staffSpellOf(note.noteNumber, keyInfo, measureAlters)
  const step = staffStepOf(note.noteNumber, spelling)
  const y = ctx.stepToY(step)
  const stemUp = step < ctx.bottomStep + 4 // below the middle line stems go up
  const nw = GLYPH_METRICS.noteheadWidth * STAFF_SPACE

  if (spelling.displayAccidental !== null) {
    const code =
      spelling.displayAccidental === 1
        ? SMUFL.accidentalSharp
        : spelling.displayAccidental === -1
          ? SMUFL.accidentalFlat
          : SMUFL.accidentalNatural
    v.glyphs.push({
      code,
      x: x - GLYPH_METRICS.accidentalWidth * STAFF_SPACE,
      y,
    })
  }

  // ledger lines beyond the staff
  if (step > ctx.topStep) {
    for (let s = ctx.topStep + 2; s <= step; s += 2) {
      const ly = ctx.stepToY(s)
      v.lines.push({
        x1: x - STAFF_SPACE * 0.8,
        y1: ly,
        x2: x + nw + STAFF_SPACE * 0.8,
        y2: ly,
        width: 1,
      })
    }
  } else if (step < ctx.bottomStep) {
    for (let s = ctx.bottomStep - 2; s >= step; s -= 2) {
      const ly = ctx.stepToY(s)
      v.lines.push({
        x1: x - STAFF_SPACE * 0.8,
        y1: ly,
        x2: x + nw + STAFF_SPACE * 0.8,
        y2: ly,
        width: 1,
      })
    }
  }

  const dotted = beats % 1 >= 0.4
  if (beats >= 3.9) {
    v.glyphs.push({ code: SMUFL.noteheadWhole, x, y })
  } else {
    v.glyphs.push({
      code: beats >= 1.9 ? SMUFL.noteheadHalf : SMUFL.noteheadBlack,
      x,
      y,
    })
    const stemX = stemUp ? x + nw : x
    const stemEnd = stemUp
      ? y - GLYPH_METRICS.stemLength * STAFF_SPACE
      : y + GLYPH_METRICS.stemLength * STAFF_SPACE
    v.lines.push({ x1: stemX, y1: y, x2: stemX, y2: stemEnd, width: 1 })
    if (beats < 0.95) {
      const flagCode =
        beats < 0.3
          ? stemUp
            ? SMUFL.flag16thUp
            : SMUFL.flag16thDown
          : stemUp
            ? SMUFL.flag8thUp
            : SMUFL.flag8thDown
      v.glyphs.push({ code: flagCode, x: stemX, y: stemEnd })
    }
  }
  if (dotted) {
    v.dots.push({
      x: x + nw + STAFF_SPACE * 0.45,
      y: step % 2 === 0 ? y - STAFF_STEP : y,
      r: STAFF_SPACE * 0.14,
    })
  }
}

const addStaffRest = (
  glyphs: NotationGlyph[],
  beats: number,
  x: number,
  ctx: StaffContext,
) => {
  let remaining = beats
  let rx = x
  const advance = GLYPH_METRICS.restWidth * STAFF_SPACE
  while (remaining >= 3.9) {
    glyphs.push({
      code: SMUFL.restWhole,
      x: rx,
      y: ctx.staffTopY + STAFF_SPACE,
    })
    rx += advance
    remaining -= 4
  }
  if (remaining >= 1.9) {
    glyphs.push({ code: SMUFL.restHalf, x: rx, y: ctx.middleLineY })
    rx += advance
    remaining -= 2
  }
  while (remaining >= 0.95) {
    glyphs.push({ code: SMUFL.restQuarter, x: rx, y: ctx.middleLineY })
    rx += advance * 0.8
    remaining -= 1
  }
  while (remaining >= 0.45) {
    glyphs.push({ code: SMUFL.rest8th, x: rx, y: ctx.middleLineY })
    rx += advance * 0.65
    remaining -= 0.5
  }
  while (remaining >= 0.2) {
    glyphs.push({ code: SMUFL.rest16th, x: rx, y: ctx.middleLineY })
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

interface LaneParams {
  measureStart: number
  numerator: number
  denominator: number
  timebase: number
  pxPerBeat: number
  notes: readonly NoteLike[]
  keyInfo: KeyInfo
  clef: Clef
  yShift: number
  /** extra shift for the jianpu lane (ledger room below the staff) */
  jianpuShift: number
  /** a note from a previous measure still sounds until this tick */
  carriedUntil: number
}

const layoutStaffLane = (lanes: NotationLanes, params: LaneParams) => {
  const {
    measureStart,
    numerator,
    denominator,
    timebase,
    pxPerBeat,
    notes,
    keyInfo,
    clef,
    yShift,
  } = params
  const tpb = (timebase * 4) / denominator
  const widthPx = numerator * pxPerBeat
  const xOf = (tick: number) => ((tick - measureStart) / tpb) * pxPerBeat
  const cd = CLEF_DATA[clef]
  const staffTopY = STAFF_TOP + yShift
  const bottomLineY = staffTopY + STAFF_SPACE * 4
  const middleLineY = staffTopY + STAFF_SPACE * 2
  const ctx: StaffContext = {
    bottomStep: cd.bottomStep,
    topStep: cd.bottomStep + 8,
    stepToY: (step: number) =>
      bottomLineY - (step - cd.bottomStep) * STAFF_STEP,
    middleLineY,
    staffTopY,
  }

  for (let i = 0; i < 5; i++) {
    const y = staffTopY + i * STAFF_SPACE
    lanes.lines.push({ x1: 0, y1: y, x2: widthPx, y2: y, width: 1 })
  }

  const measureAlters = new Map<number, number>()
  const measureEndTick = measureStart + tpb * numerator
  // a note sustained from the previous measure occupies the measure head:
  // no rest is drawn where something is still sounding
  let prevEndTick = Math.max(measureStart, params.carriedUntil)
  for (const chord of groupChords(notes)) {
    const gap = chord.tick - prevEndTick
    if (gap >= tpb * 0.2) {
      addStaffRest(lanes.glyphs, durationBeats(gap, tpb), xOf(prevEndTick), ctx)
    }
    const beats = durationBeats(
      Math.max(...chord.notes.map((n) => n.duration)),
      tpb,
    )
    const x = xOf(chord.tick)
    for (const note of [...chord.notes].sort(
      (a, b) => b.noteNumber - a.noteNumber,
    )) {
      addStaffNote(lanes, ctx, note, x, beats, keyInfo, measureAlters)
    }
    const chordEnd = Math.min(
      chord.tick + Math.max(...chord.notes.map((n) => n.duration)),
      measureEndTick,
    )
    prevEndTick = Math.max(prevEndTick, chordEnd)
  }
  const trailing = measureEndTick - prevEndTick
  if (trailing >= tpb * 0.2) {
    addStaffRest(
      lanes.glyphs,
      durationBeats(trailing, tpb),
      xOf(prevEndTick),
      ctx,
    )
  }

  lanes.lines.push({
    x1: widthPx,
    y1: staffTopY,
    x2: widthPx,
    y2: bottomLineY,
    width: 1,
  })
  return { widthPx }
}

// --------------------------------------------------------------- jianpu lane

const jianpuDurationMarks = (
  texts: NotationText[],
  lines: NotationLine[],
  beats: number,
  noteTick: number,
  digitX: number,
  numberWidth: number,
  chordTpb: number,
  baseline: number,
  xOf: (tick: number) => number,
) => {
  const intB = Math.floor(beats + 1e-6)
  const frac = beats - intB
  const underlineY = baseline + 7
  // augmentation dashes sit on the beats that follow the note
  for (let k = 1; k < intB; k++) {
    texts.push({
      text: "—",
      x: xOf(noteTick + k * chordTpb) + numberWidth / 2,
      y: baseline,
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
      x1: digitX - 2,
      y1: underlineY + i * 3,
      x2: digitX + numberWidth + 2,
      y2: underlineY + i * 3,
      width: 1.2,
    })
  }
  if (dot) {
    texts.push({
      text: "·",
      x: digitX + numberWidth + JIANPU_FONT_SIZE * 0.3,
      y: baseline,
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
  baseline: number,
  xOf: (tick: number) => number,
) => {
  const isRest = chordNotes.some((n) => n.noteNumber < 0)
  const ordered = [...chordNotes].sort((a, b) => b.noteNumber - a.noteNumber)
  const dy = JIANPU_FONT_SIZE * 0.95
  // the accidental is its own smaller glyph before the digit; underlines and
  // octave dots attach to the DIGIT, not to the accidental
  const accidentalGlyph = (acc: string) =>
    acc === "#" ? "♯" : acc === "b" ? "♭" : ""
  const accidentalWidth = JIANPU_FONT_SIZE * 0.55

  ordered.forEach((note, i) => {
    const noteBaseline = baseline - (ordered.length - 1 - i) * dy
    if (isRest) {
      texts.push({ text: "0", x: noteX, y: noteBaseline, anchor: "start" })
      return
    }
    const deg = jianpuDegreeOf(note.noteNumber, keyInfo)
    const acc = accidentalGlyph(deg.accidental)
    const digitX = noteX + (acc ? accidentalWidth : 0)
    if (acc) {
      texts.push({
        text: acc,
        x: noteX,
        y: noteBaseline,
        anchor: "start",
        size: JIANPU_FONT_SIZE * 0.8,
      })
    }
    texts.push({
      text: `${deg.degree}`,
      x: digitX,
      y: noteBaseline,
      anchor: "start",
    })
    if (deg.octave > 0) {
      for (let k = 0; k < deg.octave; k++) {
        dots.push({
          x: digitX + JIANPU_NUMBER_WIDTH / 2,
          y: noteBaseline - JIANPU_FONT_SIZE - 3 - k * 3.5,
          r: 1.6,
        })
      }
    }
  })

  const hasAccidental = chordNotes.some(
    (n) => jianpuDegreeOf(n.noteNumber, keyInfo).accidental !== "",
  )
  const marks = jianpuDurationMarks(
    texts,
    lines,
    beats,
    noteTick,
    isRest || !hasAccidental ? noteX : noteX + JIANPU_FONT_SIZE * 0.55,
    JIANPU_NUMBER_WIDTH,
    chordTpb,
    baseline,
    xOf,
  )

  if (!isRest) {
    ordered.forEach((note) => {
      const deg = jianpuDegreeOf(note.noteNumber, keyInfo)
      if (deg.octave < 0) {
        for (let k = 0; k < -deg.octave; k++) {
          dots.push({
            x:
              noteX +
              (deg.accidental !== "" ? JIANPU_FONT_SIZE * 0.55 : 0) +
              JIANPU_NUMBER_WIDTH / 2,
            y: baseline + 7 + marks.underlines * 3 + 5 + k * 3.5,
            r: 1.6,
          })
        }
      }
    })
  }
}

const layoutJianpuLane = (lanes: NotationLanes, params: LaneParams) => {
  const {
    measureStart,
    numerator,
    denominator,
    timebase,
    pxPerBeat,
    notes,
    keyInfo,
    yShift,
  } = params
  const tpb = (timebase * 4) / denominator
  const widthPx = numerator * pxPerBeat
  const xOf = (tick: number) => ((tick - measureStart) / tpb) * pxPerBeat
  const baseline = JIANPU_BASELINE + yShift + params.jianpuShift
  const measureEndTick = measureStart + tpb * numerator

  // a note sustained from the previous measure occupies the measure head
  let prevEndTick = Math.max(measureStart, params.carriedUntil)
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
        baseline,
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
      baseline,
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
      baseline,
      xOf,
    )
  }

  lanes.lines.push({
    x1: widthPx,
    y1: baseline - JIANPU_FONT_SIZE - 4,
    x2: widthPx,
    y2: baseline + 8,
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
  /** clef of the staff (default treble) */
  clef?: Clef
  /** vertical shift in px (ledger room above the staff) */
  yShift?: number
  /** extra downward shift of the jianpu lane (ledger room below) */
  jianpuShift?: number
  /** a note from the previous measure still sounds until this tick */
  carriedUntil?: number
}): NotationMeasureLayout => {
  const keyInfo = keyInfoOf(params.key, params.scale as never)
  const laneParams: LaneParams = {
    ...params,
    clef: params.clef ?? "treble",
    yShift: params.yShift ?? 0,
    jianpuShift: params.jianpuShift ?? 0,
    carriedUntil: params.carriedUntil ?? 0,
    keyInfo,
  }
  const staff: NotationLanes = { glyphs: [], texts: [], lines: [], dots: [] }
  const jianpu: NotationLanes = { glyphs: [], texts: [], lines: [], dots: [] }

  const staffResult = layoutStaffLane(staff, laneParams)
  layoutJianpuLane(jianpu, laneParams)

  const tpb = (params.timebase * 4) / params.denominator
  return {
    startTick: params.measureStart,
    durationTicks: tpb * params.numerator,
    pxPerBeat: params.pxPerBeat,
    widthPx: staffResult.widthPx,
    staff,
    jianpu,
  }
}

// ------------------------------------------------------- system-start header

/**
 * The fixed left cell of the strip: short staff lines, clef, key signature
 * and time signature on the staff lane, the jianpu key label ("1=A") on the
 * jianpu lane. Drawing them here (instead of inside the first measure)
 * keeps them visible at every scroll position and never collides with notes.
 */
export const layoutNotationHeader = (params: {
  keyInfo: KeyInfo
  clef: Clef
  yShift: number
  jianpuShift: number
  widthPx: number
  numerator: number
  denominator: number
}): { staff: NotationLanes; jianpu: NotationLanes } => {
  const {
    keyInfo,
    clef,
    yShift,
    jianpuShift,
    widthPx,
    numerator,
    denominator,
  } = params
  const staff: NotationLanes = { glyphs: [], texts: [], lines: [], dots: [] }
  const jianpu: NotationLanes = { glyphs: [], texts: [], lines: [], dots: [] }
  const cd = CLEF_DATA[clef]
  const staffTopY = STAFF_TOP + yShift
  const bottomLineY = staffTopY + STAFF_SPACE * 4
  const middleLineY = staffTopY + STAFF_SPACE * 2
  const stepToY = (step: number) =>
    bottomLineY - (step - cd.bottomStep) * STAFF_STEP

  for (let i = 0; i < 5; i++) {
    const y = staffTopY + i * STAFF_SPACE
    staff.lines.push({ x1: 0, y1: y, x2: widthPx, y2: y, width: 1 })
  }

  staff.glyphs.push({ code: cd.glyph, x: 4, y: stepToY(cd.glyphStep) })
  let tx = 2.6 * STAFF_SPACE + 4
  if (keyInfo.fifths !== 0) {
    const steps = keyInfo.fifths > 0 ? cd.sharps : cd.flats
    const code =
      keyInfo.fifths > 0 ? SMUFL.accidentalSharp : SMUFL.accidentalFlat
    const count = Math.min(Math.abs(keyInfo.fifths), 7)
    for (let i = 0; i < count; i++) {
      staff.glyphs.push({ code, x: tx, y: stepToY(steps[i]) })
      tx += STAFF_SPACE * 0.9
    }
    tx += STAFF_SPACE * 0.4
  }
  const digitsOf = (n: number) =>
    String(n)
      .split("")
      .map((d) => SMUFL.timeSig0 + Number(d))
  for (const code of digitsOf(numerator)) {
    staff.glyphs.push({ code, x: tx, y: middleLineY })
    tx += STAFF_SPACE * 1.7
  }
  tx += STAFF_SPACE * 0.4
  for (const code of digitsOf(denominator)) {
    staff.glyphs.push({ code, x: tx, y: middleLineY })
    tx += STAFF_SPACE * 1.7
  }

  const baseline = JIANPU_BASELINE + jianpuShift
  jianpu.texts.push({
    text: jianpuKeyLabel(keyInfo),
    x: 2,
    y: baseline,
    anchor: "start",
  })

  return { staff, jianpu }
}

/**
 * The measures to render for a visible tick range, snapped to real measure
 * boundaries (one lead-in measure before the range): chunk bar lines must
 * coincide with the piano roll's measure grid, so a chunk never starts
 * mid-measure.
 */
export const measureRangeFor = (params: {
  measures: readonly Measure[]
  timebase: number
  viewStartTick: number
  viewEndTick: number
}): { startTick: number; numerator: number; denominator: number }[] => {
  const { measures, timebase, viewStartTick, viewEndTick } = params
  const result: {
    startTick: number
    numerator: number
    denominator: number
  }[] = []
  if (measures.length === 0) {
    return result
  }
  const leadTicks = timebase * 2 // one 4/4 measure back, refined below
  const anchor = Math.max(0, viewStartTick - leadTicks)
  const snapped = Measure.getMeasureStart(measures, anchor, timebase)
  const denominatorOf = (ticksPerBeat: number) =>
    Math.round((timebase * 4) / ticksPerBeat)
  let startTick = snapped.tick
  const endTick = viewEndTick + snapped.duration * 2
  let guard = 0
  while (startTick < endTick && guard < 200) {
    const current = Measure.getMeasureStart(measures, startTick, timebase)
    result.push({
      startTick,
      numerator: current.numerator,
      denominator: denominatorOf(current.ticksPerBeat),
    })
    startTick += current.duration
    guard += 1
  }
  return result
}
