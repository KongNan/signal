import type { Song, TrackId } from "@signal-app/core"
import { dragNote, getDraggableArea, getDraggablePosition } from "./draggable"
import type { NoteEvent } from "./entities"
import { getTrackOrThrow } from "./getTrackOrThrow"
import {
  addClipboardNotes,
  cloneNotes,
  duplicateNotes,
  quantizeNotes,
  removeNotes,
  transposeNotes,
  updateNotes,
} from "./mutations"
import {
  getAllNoteIds,
  getNeighborNote,
  getNoteIdsInSelection,
  getNotesByIds,
  getNotesClipboardData,
} from "./queries"
import { TrackNoteMapper } from "./TrackNoteMapper"

export const createPianoRollEditor = (song: Song, trackId: TrackId) => {
  const track = getTrackOrThrow(song, trackId)
  const mapper = new TrackNoteMapper(track)

  const bindQuery =
    <A extends unknown[], R>(
      fn: (...args: A) => (context: TrackNoteMapper) => R,
    ): ((...args: A) => R) =>
    (...args: A) =>
      fn(...args)(mapper)

  // runs a composed mutation in one transaction so it emits a single change
  const bindMutation =
    <A extends unknown[], R>(
      fn: (...args: A) => (context: TrackNoteMapper) => R,
    ): ((...args: A) => R) =>
    (...args: A) =>
      track.transaction(() => fn(...args)(mapper))

  // keep the lyrics event at the note tick paired with the note

  const dragNoteWithLyrics = (
    position: { tick: number; noteNumber: number },
    noteId: number,
    draggablePosition: "left" | "right" | "center",
  ) =>
    track.transaction(() => {
      const note = mapper.getNoteById(noteId)
      const result = dragNote(position, noteId, draggablePosition)(mapper)
      if (note !== undefined && result !== null && result.tick !== note.tick) {
        mapper.moveLyricsTick(note.tick, result.tick)
      }
      return result
    })

  const removeNoteWithLyrics = (id: number) =>
    track.transaction(() => {
      const note = mapper.getNoteById(id)
      const result = mapper.removeNote(id)
      if (note !== undefined) {
        mapper.removeLyricsAtTick(note.tick)
      }
      return result
    })

  const removeNotesWithLyrics = (noteIds: readonly number[]) =>
    track.transaction(() => {
      const notes = getNotesByIds(noteIds)(mapper)
      const result = removeNotes(noteIds)(mapper)
      notes.forEach((note) => mapper.removeLyricsAtTick(note.tick))
      return result
    })

  return {
    transaction: track.transaction,

    // queries

    getAllNoteIds: bindQuery(getAllNoteIds),
    getDraggableArea: bindQuery(getDraggableArea),
    getDraggablePosition: bindQuery(getDraggablePosition),
    getNeighborNote: bindQuery(getNeighborNote),
    getNoteIdsInSelection: bindQuery(getNoteIdsInSelection),
    getNotesByIds: bindQuery(getNotesByIds),
    getNotesClipboardData: bindQuery(getNotesClipboardData),

    // mutations

    addNote: mapper.addNote,
    removeNote: removeNoteWithLyrics,
    updateNote: mapper.updateNote,
    updateNotes: (notes: readonly NoteEvent[]) =>
      track.transaction(() => updateNotes(mapper)(notes)),
    addClipboardNotes: bindMutation(addClipboardNotes),
    cloneNotes: bindMutation(cloneNotes),
    dragNote: dragNoteWithLyrics,
    duplicateNotes: bindMutation(duplicateNotes),
    quantizeNotes: bindMutation(quantizeNotes),
    removeNotes: removeNotesWithLyrics,
    transposeNotes: bindMutation(transposeNotes),
    batchUpdateNotesVelocity: track.batchUpdateNotesVelocity,
  }
}
