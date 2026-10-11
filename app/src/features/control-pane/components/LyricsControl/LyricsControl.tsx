import styled from "@emotion/styled"
import { GLCanvas, Transform } from "@ryohey/webgl-react"
import { type FC, memo, useCallback, useMemo, useState } from "react"
import { useLyricsActions } from "../../../../actions/lyrics"
import { Beats } from "../../../../components/GLNodes/Beats"
import { Cursor } from "../../../../components/GLNodes/Cursor"
import { matrixFromTranslation } from "../../../../helpers/matrix"
import { useBeats } from "../../../../hooks/useBeats"
import { useSong } from "../../../../hooks/useSong"
import { useTickScroll } from "../../../../hooks/useTickScroll"
import {
  useLyricsEvents,
  useNoteEvents,
} from "../../../piano-roll/hooks/useEventView"
import { useNoteCoordTransform } from "../../../piano-roll/hooks/useNoteCoordTransform"
import { usePianoRoll } from "../../../piano-roll/hooks/usePianoRoll"
import LyricsItem from "./LyricsItem"
import { STRIP_HEIGHT } from "./notation/layout"
import { NotationStrip, notationHeaderLabel } from "./notation/NotationStrip"

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
  justify-content: center;
  gap: 0.2rem;
  padding-right: 0.4rem;
  text-align: right;
  color: var(--color-text-secondary);
  font-size: 0.8rem;
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
  const { keySignature } = usePianoRoll()
  const { measures } = useSong()
  const { createLyrics, updateLyrics, deleteLyrics } = useLyricsActions()

  // the notation strip reports its height (it grows for ledger lines)
  const [stripHeight, setStripHeight] = useState(STRIP_HEIGHT)
  const onStripHeightChange = useCallback((h: number) => setStripHeight(h), [])

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

  const firstTs = measures[0]
  const headerLabel = notationHeaderLabel(
    keySignature?.key ?? 0,
    keySignature?.scale ?? null,
    firstTs?.numerator,
    firstTs?.denominator,
  )
  const [keyLabel, meterLabel] = headerLabel.split(" ")

  return (
    <Parent>
      <Header style={{ width: axisWidth, height }}>
        <div>{keyLabel}</div>
        <div>{meterLabel}</div>
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
          onHeightChange={onStripHeightChange}
        />
        {lyricsItems}
      </Content>
    </Parent>
  )
}

export default memo(LyricsControl)
