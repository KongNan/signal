import type { TrackEvent, TrackEventOf } from "@signal-app/core"
import type { KeySignatureEvent } from "midifile-ts"
import { useCallback } from "react"
import type { KeySignature } from "../entities/scale/KeySignature"
import { KeySignature as KeySignatureEntity } from "../entities/scale/KeySignature"
import { useHistory } from "../hooks/useHistory"
import { useSong } from "../hooks/useSong"

// Key signature persistence: the piano-roll keySignature atom is UI state,
// so writing a keySignature meta event into the conductor track keeps the
// choice alive across MIDI export/import round trips. MIDI encodes the key
// as fifths (sf) + major/minor flag; the atom uses a chromatic pitch class.

export type MidiKeySignatureEvent = TrackEventOf<KeySignatureEvent>

export const isKeySignatureEvent = (
  e: TrackEvent,
): e is MidiKeySignatureEvent => "subtype" in e && e.subtype === "keySignature"

export const midiScaleFlag = (scale: string): number =>
  KeySignatureEntity.isMinorScaleName(scale) ? 1 : 0

export const useSetSongKey = () => {
  const { pushHistory } = useHistory()
  const { conductorTrack } = useSong()

  return useCallback(
    (ks: KeySignature) => {
      if (conductorTrack === undefined) {
        return
      }
      const sf = KeySignatureEntity.keyToFifths(ks.key)
      const mi = midiScaleFlag(ks.scale)
      pushHistory()
      const atZero = conductorTrack
        .getEvents()
        .filter(isKeySignatureEvent)
        .filter((e: MidiKeySignatureEvent) => e.tick === 0)
      if (atZero.length > 0) {
        conductorTrack.updateEvents(
          atZero.map((e: MidiKeySignatureEvent) => ({
            id: e.id,
            key: sf,
            scale: mi,
          })),
        )
      } else {
        conductorTrack.addEvent<MidiKeySignatureEvent>({
          type: "meta",
          subtype: "keySignature",
          key: sf,
          scale: mi,
          tick: 0,
        })
      }
    },
    [conductorTrack, pushHistory],
  )
}
