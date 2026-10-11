import { type FC, useEffect, useMemo, useRef, useState } from "react"
import {
  isKeySignatureEvent,
  type MidiKeySignatureEvent,
} from "../../../../../actions/keys"
import { KeySignature as KeySignatureEntity } from "../../../../../entities/scale/KeySignature"
import { useSong } from "../../../../../hooks/useSong"
import { useSyncTrackQueryInternal } from "../../../../../hooks/useSyncTrackQuery"
import { useAllNoteEvents } from "../../../../piano-roll/hooks/useEventView"
import { usePianoRoll } from "../../../../piano-roll/hooks/usePianoRoll"
import { ensureBravuraFont } from "./bravura"
import { keyInfoOf } from "./keys"
export { keyInfoOf }

import {
  chooseClef,
  JIANPU_FONT_SIZE,
  jianpuKeyLabel,
  layoutNotationMeasure,
  measureRangeFor,
  type NotationLanes,
  type NotationMeasureLayout,
  STAFF_FONT_SIZE,
  STRIP_HEIGHT,
} from "./layout"

// A horizontally scrolling notation strip (staff + jianpu) synced to the
// piano roll viewport. Measure chunks are laid out in tick space and snapped
// to real measure boundaries, so bar lines sit exactly on the piano roll's
// measure grid. Chunks are rendered at a stable horizontal scale and
// stretched via CSS while the user zooms; a debounced re-layout brings note
// spacing back in line. Glyph sizes are fixed screen pixels at every zoom.
// Clef / key signature / time signature live in the strip's fixed left
// header cell (see layoutNotationHeader), not inside the first measure.

const RENDER_RATIO = 1.12 // re-layout when the zoom drifts past this
const RELAYOUT_DEBOUNCE_MS = 250
const MIN_RENDER_PX_PER_BEAT = 20
const MAX_RENDER_PX_PER_BEAT = 160

export const LaneItems: FC<{
  lanes: NotationLanes
  glyphFontSize: number
  textFontSize: number
}> = ({ lanes, glyphFontSize, textFontSize }) => (
  <>
    {lanes.lines.map((l, i) => (
      <line
        key={`l${i}`}
        x1={l.x1}
        y1={l.y1}
        x2={l.x2}
        y2={l.y2}
        stroke="var(--color-text)"
        strokeWidth={l.width}
      />
    ))}
    {lanes.glyphs.map((g, i) => (
      <text
        key={`g${i}`}
        x={g.x}
        y={g.y}
        fontSize={glyphFontSize}
        style={{ fontFamily: "Bravura" }}
        fill="var(--color-text)"
      >
        {String.fromCodePoint(g.code)}
      </text>
    ))}
    {lanes.texts.map((t, i) => (
      <text
        key={`t${i}`}
        x={t.x}
        y={t.y}
        fontSize={t.size ?? textFontSize}
        style={{ fontFamily: "serif" }}
        fill="var(--color-text)"
        textAnchor={t.anchor}
      >
        {t.text}
      </text>
    ))}
    {lanes.dots.map((d, i) => (
      <circle
        key={`d${i}`}
        cx={d.x}
        cy={d.y}
        r={d.r}
        fill="var(--color-text)"
      />
    ))}
  </>
)

interface MeasureChunkProps {
  layout: NotationMeasureLayout
  /** screen-space x of the measure start (barline-aligned) */
  left: number
  scaleX: number
  height: number
}

const MeasureChunk: FC<MeasureChunkProps> = ({
  layout,
  left,
  scaleX,
  height,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left,
        width: layout.widthPx * scaleX,
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <svg
        width={layout.widthPx}
        height={height}
        style={{
          transform: `scaleX(${scaleX})`,
          transformOrigin: "0 0",
          display: "block",
        }}
      >
        <LaneItems
          lanes={layout.staff}
          glyphFontSize={STAFF_FONT_SIZE}
          textFontSize={JIANPU_FONT_SIZE}
        />
        <LaneItems
          lanes={layout.jianpu}
          glyphFontSize={STAFF_FONT_SIZE}
          textFontSize={JIANPU_FONT_SIZE}
        />
      </svg>
    </div>
  )
}

export interface NotationStripProps {
  /** visible tick range of the piano roll */
  tickRange: readonly [number, number]
  /** piano roll x transform (tick -> px) */
  transform: { getX(tick: number): number }
  /** piano roll scroll position in px */
  scrollLeft: number
}

const clampPxPerBeat = (v: number) =>
  Math.min(Math.max(v, MIN_RENDER_PX_PER_BEAT), MAX_RENDER_PX_PER_BEAT)

/** index of the first note with tick >= tick (notes sorted by tick) */
const lowerBound = (
  notes: readonly { tick: number }[],
  tick: number,
): number => {
  let lo = 0
  let hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (notes[mid].tick < tick) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

/** keySignature meta events of the conductor track (tick, sf, mi) */
export const useConductorKeyEvents = () => {
  const { conductorTrack } = useSong()
  return useSyncTrackQueryInternal(
    conductorTrack,
    (t) =>
      t
        .getEvents()
        .filter(isKeySignatureEvent)
        .map((e: MidiKeySignatureEvent) => ({
          tick: e.tick,
          sf: e.key,
          mi: e.scale,
        })),
    isKeySignatureEvent,
  )
}

type ConductorKeyEvent = { tick: number; sf: number; mi: number }

/**
 * The key in effect at a tick: the user's piano-roll choice wins, otherwise
 * the conductor track's keySignature events (imported files), otherwise C.
 */
export const effectiveKeyAt = (
  conductorKeyEvents: readonly ConductorKeyEvent[] | undefined,
  tick: number,
  atomKeySignature: KeySignatureEntity | null | undefined,
): KeySignatureEntity => {
  if (atomKeySignature !== null && atomKeySignature !== undefined) {
    return atomKeySignature
  }
  let event = null
  if (conductorKeyEvents !== undefined) {
    for (const e of conductorKeyEvents) {
      if (e.tick <= tick) {
        event = e
      } else {
        break
      }
    }
  }
  if (event === null) {
    return { key: 0, scale: "major" }
  }
  return KeySignatureEntity.fromMidiValues(event.sf, event.mi)
}

/**
 * Shared notation context: clef (by ledger-line cost) and the effective key.
 * Used by the strip itself and by the fixed left header cell, which must
 * align with the staff and jianpu lanes. The strip region is FIXED at three
 * staff heights (staff centered) — no dynamic resizing for registers.
 */
export const useNotationContext = (viewStartTick: number) => {
  const allNotes = useAllNoteEvents()
  const { keySignature } = usePianoRoll()
  const conductorKeyEvents = useConductorKeyEvents()

  const sortedNotes = useMemo(
    () => [...allNotes].sort((a, b) => a.tick - b.tick),
    [allNotes],
  )

  const clef = useMemo(() => {
    if (sortedNotes.length === 0) {
      return "treble" as const
    }
    return chooseClef(
      sortedNotes[0].noteNumber,
      sortedNotes[sortedNotes.length - 1].noteNumber,
    )
  }, [sortedNotes])

  const viewKey = useMemo(
    () => effectiveKeyAt(conductorKeyEvents, viewStartTick, keySignature),
    [conductorKeyEvents, viewStartTick, keySignature],
  )

  return {
    sortedNotes,
    clef,
    yShift: 0,
    jianpuShift: 0,
    stripHeight: STRIP_HEIGHT,
    viewKey,
    keySignature,
    conductorKeyEvents,
  }
}

export const NotationStrip: FC<NotationStripProps> = ({
  tickRange,
  transform,
  scrollLeft,
}) => {
  const { measures, timebase } = useSong()
  const context = useNotationContext(tickRange[0])
  const {
    sortedNotes,
    clef,
    yShift,
    jianpuShift,
    stripHeight,
    keySignature,
    conductorKeyEvents,
  } = context
  const pxPerTick = transform.getX(timebase) / timebase

  const [fontReady, setFontReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    ensureBravuraFont().then(() => {
      if (!cancelled) {
        setFontReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // the beat unit (ticks per beat) of the first visible measure — used for
  // the stable render scale and the pxPerBeat <-> pxPerTick conversion
  const firstTpb = useMemo(() => {
    let ts = measures[0]
    for (const m of measures) {
      if (m.tick <= tickRange[0]) {
        ts = m
      } else {
        break
      }
    }
    return ts !== undefined ? (timebase * 4) / ts.denominator : timebase
  }, [measures, timebase, tickRange[0]])

  const pxPerBeat = pxPerTick * firstTpb

  const [renderedPxPerBeat, setRenderedPxPerBeat] = useState(() =>
    clampPxPerBeat(pxPerBeat),
  )
  const timerRef = useRef<number | null>(null)
  useEffect(() => {
    const ratio = pxPerBeat / renderedPxPerBeat
    if (ratio > 1 / RENDER_RATIO && ratio < RENDER_RATIO) {
      return
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      setRenderedPxPerBeat(clampPxPerBeat(pxPerBeat))
    }, RELAYOUT_DEBOUNCE_MS)
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [pxPerBeat, renderedPxPerBeat])

  const renderedPxPerTick = renderedPxPerBeat / firstTpb

  // measures to render, snapped to real measure boundaries
  const visibleMeasures = useMemo(
    () =>
      measureRangeFor({
        measures,
        timebase,
        viewStartTick: tickRange[0],
        viewEndTick: tickRange[1],
      }),
    [measures, timebase, tickRange[0], tickRange[1]],
  )

  const layouts = useMemo(() => {
    const jShift = jianpuShift
    // a note sustained from before the first rendered measure occupies its head
    let carry = 0
    const firstStart = visibleMeasures[0]?.startTick ?? 0
    const firstLo = lowerBound(sortedNotes, firstStart)
    for (let i = 0; i < firstLo; i++) {
      const end = sortedNotes[i].tick + sortedNotes[i].duration
      if (end > firstStart) {
        carry = Math.max(carry, end)
      }
    }
    const noteEnd =
      sortedNotes.length > 0
        ? sortedNotes[sortedNotes.length - 1].tick +
          sortedNotes[sortedNotes.length - 1].duration
        : 0
    return (
      visibleMeasures
        // beyond the last note the strip stays empty, like the piano roll
        .filter((m) => m.startTick < noteEnd)
        .map((m) => {
          const tpb = (timebase * 4) / m.denominator
          const measureEnd = m.startTick + tpb * m.numerator
          const lo = lowerBound(sortedNotes, m.startTick)
          const hi = lowerBound(sortedNotes, measureEnd)
          const slice = sortedNotes.slice(lo, hi)
          const effectiveKey = effectiveKeyAt(
            conductorKeyEvents,
            m.startTick,
            keySignature,
          )
          const layout = layoutNotationMeasure({
            measureStart: m.startTick,
            numerator: m.numerator,
            denominator: m.denominator,
            timebase,
            notes: slice,
            key: effectiveKey.key,
            scale: effectiveKey.scale,
            pxPerBeat: renderedPxPerTick * tpb,
            clef,
            yShift,
            jianpuShift: jShift,
            carriedUntil: carry,
          })
          for (const n of slice) {
            carry = Math.max(carry, n.tick + n.duration)
          }
          return layout
        })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visibleMeasures,
    sortedNotes,
    timebase,
    renderedPxPerTick,
    fontReady,
    keySignature,
    conductorKeyEvents,
    clef,
    yShift,
    jianpuShift,
  ])

  const scaleX = pxPerTick / renderedPxPerTick

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: stripHeight,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {layouts.map((layout) => (
        <MeasureChunk
          key={`${layout.startTick}-${renderedPxPerBeat}`}
          layout={layout}
          left={transform.getX(layout.startTick) - scrollLeft}
          scaleX={scaleX}
          height={stripHeight}
        />
      ))}
    </div>
  )
}

/** Fixed header cell content: jianpu key label + time signature. */
export const notationHeaderLabel = (
  key: number,
  scale: Parameters<typeof keyInfoOf>[1],
  numerator?: number,
  denominator?: number,
): string => {
  const info = keyInfoOf(key, scale)
  const meter =
    numerator !== undefined && denominator !== undefined
      ? ` ${numerator}/${denominator}`
      : ""
  return jianpuKeyLabel(info) + meter
}
