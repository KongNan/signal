import { Song, Track, type TrackEventOf } from "@signal-app/core"
import type { LyricsEvent } from "midifile-ts"
import { describe, expect, it, vi } from "vitest"
import { createPianoRollEditor } from "./createPianoRollEditor"

const newSongWithTrack = () => {
  const song = new Song()
  const track = new Track()
  // A song's first-ever track defaults to being the channel-less conductor
  // track, which silently drops "channel"-type events (including notes).
  track.channel = 0
  song.addTrack(track)
  return { song, track }
}

const addLyrics = (track: Track, text: string, tick: number) =>
  track.addEvent<TrackEventOf<LyricsEvent>>({
    type: "meta",
    subtype: "lyrics",
    text,
    tick,
  })

const getLyricsTicks = (track: Track) =>
  track
    .getEvents()
    .filter((e): e is TrackEventOf<LyricsEvent> => e.subtype === "lyrics")
    .map((e) => ({ tick: e.tick, text: e.text }))

describe("createPianoRollEditor", () => {
  it("runs a composed mutation in one transaction, emitting a single change", () => {
    const { song, track } = newSongWithTrack()
    const editor = createPianoRollEditor(song, track.id)
    const first = editor.addNote({
      tick: 10,
      duration: 10,
      noteNumber: 60,
      velocity: 100,
    })
    const second = editor.addNote({
      tick: 20,
      duration: 10,
      noteNumber: 62,
      velocity: 100,
    })

    const listener = vi.fn()
    track.onEventsChanged.subscribe(listener)

    // removes two notes; without a transaction this would notify twice
    editor.removeNotes([first.id, second.id])

    expect(editor.getAllNoteIds()).toStrictEqual([])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  describe("lyrics pairing", () => {
    it("moves the lyrics event when the note is dragged to another tick", () => {
      const { song, track } = newSongWithTrack()
      const editor = createPianoRollEditor(song, track.id)
      const note = editor.addNote({
        tick: 100,
        duration: 50,
        noteNumber: 60,
        velocity: 100,
      })
      addLyrics(track, "la", 100)

      editor.dragNote({ tick: 200, noteNumber: 60 }, note.id, "center")

      expect(getLyricsTicks(track)).toStrictEqual([{ tick: 200, text: "la" }])
    })

    it("keeps the lyrics event when resizing the note from the right edge", () => {
      const { song, track } = newSongWithTrack()
      const editor = createPianoRollEditor(song, track.id)
      const note = editor.addNote({
        tick: 100,
        duration: 50,
        noteNumber: 60,
        velocity: 100,
      })
      addLyrics(track, "la", 100)

      editor.dragNote({ tick: 200, noteNumber: 60 }, note.id, "right")

      expect(getLyricsTicks(track)).toStrictEqual([{ tick: 100, text: "la" }])
    })

    it("moves the lyrics event when resizing the note from the left edge", () => {
      const { song, track } = newSongWithTrack()
      const editor = createPianoRollEditor(song, track.id)
      const note = editor.addNote({
        tick: 100,
        duration: 50,
        noteNumber: 60,
        velocity: 100,
      })
      addLyrics(track, "la", 100)

      editor.dragNote({ tick: 50, noteNumber: 60 }, note.id, "left")

      expect(getLyricsTicks(track)).toStrictEqual([{ tick: 50, text: "la" }])
    })

    it("removes the paired lyrics event when the note is removed", () => {
      const { song, track } = newSongWithTrack()
      const editor = createPianoRollEditor(song, track.id)
      const note = editor.addNote({
        tick: 100,
        duration: 50,
        noteNumber: 60,
        velocity: 100,
      })
      addLyrics(track, "la", 100)
      addLyrics(track, "keep", 300)

      editor.removeNote(note.id)

      expect(getLyricsTicks(track)).toStrictEqual([{ tick: 300, text: "keep" }])
    })

    it("removes paired lyrics events when notes are removed in a batch", () => {
      const { song, track } = newSongWithTrack()
      const editor = createPianoRollEditor(song, track.id)
      const first = editor.addNote({
        tick: 100,
        duration: 50,
        noteNumber: 60,
        velocity: 100,
      })
      const second = editor.addNote({
        tick: 300,
        duration: 50,
        noteNumber: 62,
        velocity: 100,
      })
      addLyrics(track, "a", 100)
      addLyrics(track, "b", 300)
      addLyrics(track, "keep", 500)

      const listener = vi.fn()
      track.onEventsChanged.subscribe(listener)

      editor.removeNotes([first.id, second.id])

      expect(getLyricsTicks(track)).toStrictEqual([{ tick: 500, text: "keep" }])
      // note removal + lyrics cleanup should notify once
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it("leaves lyrics events alone when notes are quantized", () => {
      const { song, track } = newSongWithTrack()
      const editor = createPianoRollEditor(song, track.id)
      const note = editor.addNote({
        tick: 100,
        duration: 50,
        noteNumber: 60,
        velocity: 100,
      })
      addLyrics(track, "la", 100)

      editor.quantizeNotes([note.id], () => 0)

      // matches the original behavior: quantize does not move lyrics
      expect(getLyricsTicks(track)).toStrictEqual([{ tick: 100, text: "la" }])
    })
  })
})
