import { type FC, useEffect, useMemo, useRef, useState } from "react"
import { useSong } from "../../../../../hooks/useSong"
import { useNoteEvents } from "../../../../piano-roll/hooks/useEventView"
import { usePianoRoll } from "../../../../piano-roll/hooks/usePianoRoll"
import { ensureBravuraFont } from "./bravura"
import { keyInfoOf } from "./keys"
import {
  JIANPU_FONT_SIZE,
  jianpuKeyLabel,
  layoutNotationMeasure,
  type NotationLanes,
  type NotationMeasureLayout,
  STAFF_FONT_SIZE,
  STRIP_HEIGHT,
} from "./layout"

// A horizontally scrolling notation strip (staff + jianpu) synced to the
// piano roll viewport. Measure chunks are laid out in tick space so bar
// lines sit exactly on the piano roll's measure grid. Chunks are rendered
// at a stable horizontal scale and stretched via CSS while the user zooms;
// a debounced re-layout brings note spacing back in line. Glyph sizes are
// fixed screen pixels at every zoom level.

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
}

const MeasureChunk: FC<MeasureChunkProps> = ({ layout, left, scaleX }) => {
  const totalWidth = layout.leadPx + layout.widthPx
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: left - layout.leadPx * scaleX,
        width: totalWidth * scaleX,
        height: STRIP_HEIGHT,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <svg
        width={totalWidth}
        height={STRIP_HEIGHT}
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
}

const clampPxPerBeat = (v: number) =>
  Math.min(Math.max(v, MIN_RENDER_PX_PER_BEAT), MAX_RENDER_PX_PER_BEAT)

export const NotationStrip: FC<NotationStripProps> = ({
  tickRange,
  transform,
  scrollLeft,
}) => {
  const { measures, timebase, endOfSong } = useSong()
  const notes = useNoteEvents()
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
    void endOfSong
    return result
  }, [measures, timebase, tickRange[0], tickRange[1]])

  const layouts = useMemo(
    () =>
      visibleMeasures.map((m) => {
        const tpb = (timebase * 4) / m.denominator
        const measureEnd = m.startTick + tpb * m.numerator
        const notesInMeasure = notes.filter(
          (n) => n.tick >= m.startTick && n.tick < measureEnd,
        )
        return layoutNotationMeasure({
          measureStart: m.startTick,
          numerator: m.numerator,
          denominator: m.denominator,
          timebase,
          notes: notesInMeasure,
          key: keySignature?.key ?? 0,
          scale: keySignature?.scale ?? null,
          pxPerBeat: renderedPxPerTick * tpb,
          isFirst: m.startTick <= 0,
        })
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      visibleMeasures,
      notes,
      timebase,
      renderedPxPerTick,
      fontReady,
      keySignature,
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
        height: STRIP_HEIGHT,
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
