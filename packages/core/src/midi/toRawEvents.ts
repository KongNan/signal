import flatten from "lodash/flatten"
import type { AnyEvent } from "midifile-ts"
import {
  type DeltaTimeProvider,
  isSignalEvent,
  mapFromSignalEvent,
  type TickProvider,
  type TrackEvent,
} from "../entities"
import { deassemble as deassembleNote } from "./noteAssembler"
import { encodeMidiText } from "./textEncoding"

// events in each tracks
export function addDeltaTime<T extends TickProvider>(
  events: T[],
): (T & DeltaTimeProvider)[] {
  let prevTick = 0
  return events
    .sort((a, b) => a.tick - b.tick)
    .map((e) => {
      const newEvent = {
        ...e,
        deltaTime: Math.round(e.tick) - Math.round(prevTick),
      }
      // biome-ignore lint/suspicious/noExplicitAny: ignore
      delete (newEvent as any).tick
      prevTick = e.tick
      return newEvent
    })
}

// convert the signal event to the normal sequencer specific event
const fromSignalEvent = (e: TrackEvent): TrackEvent => {
  if (isSignalEvent(e)) {
    return mapFromSignalEvent(e)
  }
  return e
}

// Write lyric/text meta events as UTF-8 bytes: midifile-ts serializes one
// char per byte, which would truncate non-Latin1 characters.
const encodeTextEvent = (e: TrackEvent): TrackEvent => {
  if (
    e.type === "meta" &&
    (e.subtype === "lyrics" || e.subtype === "text") &&
    typeof e.text === "string"
  ) {
    return { ...e, text: encodeMidiText(e.text) }
  }
  return e
}

export function toRawEvents(events: readonly TrackEvent[]): AnyEvent[] {
  const a = flatten(
    events.map(fromSignalEvent).map(encodeTextEvent).map(deassembleNote),
  )
  const c = addDeltaTime(a)
  return c as AnyEvent[]
}
