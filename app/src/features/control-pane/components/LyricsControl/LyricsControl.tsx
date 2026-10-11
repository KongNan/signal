import styled from "@emotion/styled"
import { GLCanvas, Transform } from "@ryohey/webgl-react"
import { type FC, memo, useCallback, useMemo } from "react"
import { useLyricsActions } from "../../../../actions/lyrics"
import { Beats } from "../../../../components/GLNodes/Beats"
import { Cursor } from "../../../../components/GLNodes/Cursor"
import { matrixFromTranslation } from "../../../../helpers/matrix"
import { useBeats } from "../../../../hooks/useBeats"
import { useTickScroll } from "../../../../hooks/useTickScroll"
import {
  useLyricsEvents,
  useNoteEvents,
} from "../../../piano-roll/hooks/useEventView"
import { useNoteCoordTransform } from "../../../piano-roll/hooks/useNoteCoordTransform"
import { GraphAxis } from "../LineGraph/GraphAxis"
import LyricsItem from "./LyricsItem"

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

const LyricsControl: FC<LyricsControlProps> = ({
  width,
  height,
  axisWidth,
}) => {
  const { transform } = useNoteCoordTransform()
  const notes = useNoteEvents()
  const lyricsEvents = useLyricsEvents()
  const { cursorX, scrollLeft } = useTickScroll()
  const beats = useBeats()
  const { createLyrics, updateLyrics, deleteLyrics } = useLyricsActions()

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
    const itemX = (tick: number) =>
      axisWidth + transform.getX(tick) - scrollLeft
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
          width={itemWidth(n.tick, n.duration)}
        />
      ))

    return [...lyrics, ...emptyLyrics]
  }, [
    notes,
    lyricsEvents,
    transform,
    scrollLeft,
    axisWidth,
    createLyrics,
    updateLyricsText,
  ])

  return (
    <Parent>
      <GraphAxis width={axisWidth} values={[]} onClick={() => {}} />
      <GLCanvas width={width} height={height}>
        <Transform matrix={scrollXMatrix}>
          <Beats height={height} beats={beats} zIndex={2} />
          <Cursor x={cursorX} height={height} zIndex={4} />
        </Transform>
      </GLCanvas>
      {lyricsItems}
    </Parent>
  )
}

export default memo(LyricsControl)
