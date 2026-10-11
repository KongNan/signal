import type { TrackEventOf } from "@signal-app/core"
import type { LyricsEvent } from "midifile-ts"
import { useCallback } from "react"
import { usePianoRoll } from "../features/piano-roll/hooks/usePianoRoll"
import { useHistory } from "../hooks/useHistory"
import { useSong } from "../hooks/useSong"

// Lyrics editing actions for the selected track.
// Lyrics are regular MIDI meta events (subtype: "lyrics") placed at the
// same tick as their note. Keeping them paired with note moves/removals is
// handled by the pianoroll editor mutations.

export const useLyricsActions = () => {
  const { pushHistory } = useHistory()
  const { getTrack } = useSong()
  const { selectedTrackId } = usePianoRoll()

  const createLyrics = useCallback(
    (text: string, tick: number) => {
      const track = getTrack(selectedTrackId)
      if (track === undefined || text.length === 0) {
        return
      }
      pushHistory()
      track.addEvent<TrackEventOf<LyricsEvent>>({
        type: "meta",
        subtype: "lyrics",
        text,
        tick,
      })
    },
    [getTrack, selectedTrackId, pushHistory],
  )

  const updateLyrics = useCallback(
    (id: number, text: string) => {
      const track = getTrack(selectedTrackId)
      if (track === undefined) {
        return
      }
      pushHistory()
      track.updateEvent(id, { text })
    },
    [getTrack, selectedTrackId, pushHistory],
  )

  const deleteLyrics = useCallback(
    (id: number) => {
      const track = getTrack(selectedTrackId)
      if (track === undefined) {
        return
      }
      pushHistory()
      track.removeEvent(id)
    },
    [getTrack, selectedTrackId, pushHistory],
  )

  return {
    createLyrics,
    updateLyrics,
    deleteLyrics,
  }
}
