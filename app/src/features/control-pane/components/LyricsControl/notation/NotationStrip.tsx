import { type FC, useEffect, useMemo, useRef, useState } from "react"
import { useSong } from "../../../../../hooks/useSong"
import { useAllNoteEvents } from "../../../../piano-roll/hooks/useEventView"
import { usePianoRoll } from "../../../../piano-roll/hooks/usePianoRoll"
import { ensureBravuraFont } from "./bravura"
import { keyInfoOf } from "./keys"
import {
  chooseClef,
  JIANPU_FONT_SIZE,
  jianpuKeyLabel,
  layoutNotationMeasure,
  ledgerExtents,
  type NotationLanes,
  type NotationMeasureLayout,
  STAFF_FONT_SIZE,
  STAFF_SPACE,
  STRIP_HEIGHT,
} from "./layout"

// A horizontally scrolling notation strip (staff + jianpu) synced to the
// piano roll viewport. Measure chunks are laid out in tick space so bar
// lines sit exactly on the piano roll's measure grid. Chunks are rendered
// at a stable horizontal scale and stretched via CSS while the user zooms;
// a debounced re-layout brings note spacing back in line. Glyph sizes are
// fixed screen pixels at every zoom level.
//
// Notes come from the WHOLE track (not the windowed view): measures at the
// edges of the visible range must lay out completely, or phantom rests
// would appear and shift while scrolling. Measures beyond the end of the
// song are not rendered — an empty region stays empty, like the piano roll.

const RENDER_RATIO = 1.12 // re-layout when the zoom drifts past this
const RELAYOUT_DEBOUNCE_MS = 250
const MIN_RENDER_PX_PER_BEAT = 20
const MAX_RENDER_PX_PER_BEAT = 160

interface VisibleMeasure {
  readonly startTick: number
  readonly numerator: number
  readonly denominator: number
}

const LaneItems: FC<{
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
        fontSize={textFontSize}
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
  /** screen-space x of the measure's musical start (barline-aligned) */
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
  const totalWidth = layout.leadPx + layout.widthPx
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: left - layout.leadPx * scaleX,
        width: totalWidth * scaleX,
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <svg
        width={totalWidth}
        height={height}
        style={{
          transform: `scaleX(${scaleX})`,
          transformOrigin: "0 0",
          display: "block",
        }}
      >
        <g transform={`translate(${layout.leadPx} 0)`}>
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
        </g>
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
  /** reports the strip height so the parent can place lyrics below it */
  onHeightChange?: (height: number) => void
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

export const NotationStrip: FC<NotationStripProps> = ({
  tickRange,
  transform,
  scrollLeft,
  onHeightChange,
}) => {
  const { measures, timebase } = useSong()
  const allNotes = useAllNoteEvents()
  const { keySignature } = usePianoRoll()
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

  // notes sorted by tick, so each measure can slice its notes in O(log n)
  const sortedNotes = useMemo(
    () => [...allNotes].sort((a, b) => a.tick - b.tick),
    [allNotes],
  )

  // the notation content ends with the last note — NOT song.endOfSong,
  // which carries a large composing margin past the written music
  const noteEnd = useMemo(() => {
    const last = sortedNotes[sortedNotes.length - 1]
    return last !== undefined ? last.tick + last.duration : 0
  }, [sortedNotes])

  // clef from the whole-track register; the strip grows for ledger lines
  const clef = useMemo(() => {
    if (sortedNotes.length === 0) {
      return "treble" as const
    }
    return chooseClef(
      sortedNotes[0].noteNumber,
      sortedNotes[sortedNotes.length - 1].noteNumber,
    )
  }, [sortedNotes])

  const extents = useMemo(() => {
    if (sortedNotes.length === 0) {
      return { above: 0, below: 0 }
    }
    return ledgerExtents(
      sortedNotes[0].noteNumber,
      sortedNotes[sortedNotes.length - 1].noteNumber,
      clef,
    )
  }, [sortedNotes, clef])

  const yShift = extents.above * STAFF_SPACE
  const stripHeight =
    STRIP_HEIGHT + (extents.above + extents.below) * STAFF_SPACE

  useEffect(() => {
    onHeightChange?.(stripHeight)
  }, [stripHeight, onHeightChange])

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

  // expand measure boundaries around the visible range
  const visibleMeasures = useMemo(() => {
    const result: VisibleMeasure[] = []
    if (measures.length === 0) {
      return result
    }
    let ts = measures[0]
    for (const m of measures) {
      if (m.tick <= tickRange[0]) {
        ts = m
      } else {
        break
      }
    }
    const leadTpb = (timebase * 4) / ts.denominator
    const leadDur = leadTpb * ts.numerator
    // start one measure before the visible range for lead-in
    let startTick = Math.max(0, tickRange[0] - leadDur)
    const endTick = tickRange[1] + leadDur * 2
    let guard = 0
    while (startTick < endTick && guard < 100) {
      let current = measures[0]
      for (const m of measures) {
        if (m.tick <= startTick) {
          current = m
        } else {
          break
        }
      }
      const tpb = (timebase * 4) / current.denominator
      result.push({
        startTick,
        numerator: current.numerator,
        denominator: current.denominator,
      })
      startTick += tpb * current.numerator
      guard += 1
    }
    return result
  }, [measures, timebase, tickRange[0], tickRange[1]])

  const layouts = useMemo(
    () =>
      visibleMeasures
        // beyond the last note the strip stays empty, like the piano roll
        .filter((m) => m.startTick < noteEnd)
        .map((m) => {
          const tpb = (timebase * 4) / m.denominator
          const measureEnd = m.startTick + tpb * m.numerator
          const lo = lowerBound(sortedNotes, m.startTick)
          const hi = lowerBound(sortedNotes, measureEnd)
          return layoutNotationMeasure({
            measureStart: m.startTick,
            numerator: m.numerator,
            denominator: m.denominator,
            timebase,
            notes: sortedNotes.slice(lo, hi),
            key: keySignature?.key ?? 0,
            scale: keySignature?.scale ?? null,
            pxPerBeat: renderedPxPerTick * tpb,
            isFirst: m.startTick <= 0,
            clef,
            yShift,
          })
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      visibleMeasures,
      sortedNotes,
      timebase,
      renderedPxPerTick,
      fontReady,
      keySignature,
      clef,
      yShift,
      noteEnd,
    ],
  )

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
