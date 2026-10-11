import styled from "@emotion/styled"
import { GLCanvas, Transform } from "@ryohey/webgl-react"
import { Measure } from "@signal-app/core"
import { type FC, memo, useCallback, useMemo, useState } from "react"
import { useSetSongKey } from "../../../../actions/keys"
import { useLyricsActions } from "../../../../actions/lyrics"
import { Beats } from "../../../../components/GLNodes/Beats"
import { Cursor } from "../../../../components/GLNodes/Cursor"
import type { KeySignature } from "../../../../entities/scale/KeySignature"
import { matrixFromTranslation } from "../../../../helpers/matrix"
import { useBeats } from "../../../../hooks/useBeats"
import { useSong } from "../../../../hooks/useSong"
import { useTickScroll } from "../../../../hooks/useTickScroll"
import { KeySignatureDialog } from "../../../piano-roll/components/dialogs/KeySignatureDialog"
import {
  useLyricsEvents,
  useNoteEvents,
} from "../../../piano-roll/hooks/useEventView"
import { useNoteCoordTransform } from "../../../piano-roll/hooks/useNoteCoordTransform"
import { usePianoRoll } from "../../../piano-roll/hooks/usePianoRoll"
import LyricsItem from "./LyricsItem"
import { layoutNotationHeader } from "./notation/layout"
import {
  keyInfoOf,
  LaneItems,
  NotationStrip,
  useNotationContext,
} from "./notation/NotationStrip"

export interface LyricsControlProps {
  width: number
  height: number
  axisWidth: number
}

const Parent = styled.div`
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
`

const Header = styled.div`
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 0.2rem;
  padding-right: 0.4rem;
  text-align: right;
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    color: var(--color-text);
  }
`

const Content = styled.div`
  position: relative;
`

const LyricsControl: FC<LyricsControlProps> = ({
  width,
  height,
  axisWidth,
}) => {
  const { transform } = useNoteCoordTransform()
  const notes = useNoteEvents()
  const lyricsEvents = useLyricsEvents()
  const { cursorX, scrollLeft, tickRange } = useTickScroll()
  const beats = useBeats()
  const { setKeySignature } = usePianoRoll()
  const { measures, timebase } = useSong()
  const setSongKey = useSetSongKey()
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const { createLyrics, updateLyrics, deleteLyrics } = useLyricsActions()

  // shared strip context: clef, ledger extents, effective key, height
  const notation = useNotationContext(tickRange[0])
  const stripHeight = notation.stripHeight

  const scrollXMatrix = useMemo(
    () => matrixFromTranslation(-scrollLeft, 0),
    [scrollLeft],
  )

  const updateLyricsText = useCallback(
    (id: number) => (text: string) => {
      if (text) {
        updateLyrics(id, text)
      } else {
        deleteLyrics(id)
      }
    },
    [updateLyrics, deleteLyrics],
  )

  const lyricsItems = useMemo(() => {
    const itemX = (tick: number) => transform.getX(tick) - scrollLeft
    const itemWidth = (tick: number, duration: number) =>
      transform.getX(tick + duration) - transform.getX(tick)

    const lyrics = lyricsEvents.map((e) => {
      const note = notes.find((n) => n.tick === e.tick)
      return (
        <LyricsItem
          key={`lyrics-${e.id}`}
          lyrics={e.text}
          onChange={updateLyricsText(e.id)}
          x={itemX(e.tick)}
          top={stripHeight + 4}
          width={note ? itemWidth(note.tick, note.duration) : 50}
        />
      )
    })

    const emptyLyrics = notes
      .filter((n) => !lyricsEvents.some((l) => l.tick === n.tick))
      .map((n) => (
        <LyricsItem
          key={`note-${n.id}`}
          lyrics=""
          onChange={(text) => createLyrics(text, n.tick)}
          x={itemX(n.tick)}
          top={stripHeight + 4}
          width={itemWidth(n.tick, n.duration)}
        />
      ))

    return [...lyrics, ...emptyLyrics]
  }, [
    notes,
    lyricsEvents,
    transform,
    scrollLeft,
    stripHeight,
    createLyrics,
    updateLyricsText,
  ])

  const handleKeyChange = useCallback(
    (ks: KeySignature) => {
      setKeySignature(ks)
      setSongKey(ks)
    },
    [setKeySignature, setSongKey],
  )

  // the system-start header: staff lines + clef + key + time signature on
  // the staff lane, the jianpu key label on the jianpu lane
  const headerLanes = useMemo(() => {
    const viewTs = Measure.getMeasureStart(measures, tickRange[0], timebase)
    return layoutNotationHeader({
      keyInfo: keyInfoOf(notation.viewKey.key, notation.viewKey.scale),
      clef: notation.clef,
      yShift: notation.yShift,
      jianpuShift: notation.jianpuShift,
      widthPx: axisWidth,
      numerator: viewTs.numerator,
      denominator: Math.round((timebase * 4) / viewTs.ticksPerBeat),
    })
  }, [notation, axisWidth, measures, timebase, tickRange[0]])

  return (
    <Parent>
      <Header
        style={{ width: axisWidth, height }}
        title="Key / Scale"
        onClick={() => setKeyDialogOpen(true)}
      >
        <svg
          width={axisWidth}
          height={stripHeight}
          style={{ display: "block" }}
        >
          <LaneItems
            lanes={headerLanes.staff}
            glyphFontSize={28}
            textFontSize={17}
          />
          <LaneItems
            lanes={headerLanes.jianpu}
            glyphFontSize={28}
            textFontSize={17}
          />
        </svg>
      </Header>
      <Content style={{ width, height }}>
        <GLCanvas width={width} height={height}>
          <Transform matrix={scrollXMatrix}>
            <Beats height={height} beats={beats} zIndex={2} />
            <Cursor x={cursorX} height={height} zIndex={4} />
          </Transform>
        </GLCanvas>
        <NotationStrip
          tickRange={tickRange}
          transform={transform}
          scrollLeft={scrollLeft}
        />
        {lyricsItems}
      </Content>
      <KeySignatureDialog
        open={keyDialogOpen}
        onOpenChange={setKeyDialogOpen}
        onChange={handleKeyChange}
      />
    </Parent>
  )
}

export default memo(LyricsControl)
