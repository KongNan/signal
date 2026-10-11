import { ValueEventType } from "@signal-app/control-editor"
import { MIDIControlEvents } from "midifile-ts"

export type ControlMode =
  | { type: "velocity" }
  | { type: "lyrics" }
  | ValueEventType

export const controlModeKey = (controlMode: ControlMode) => {
  switch (controlMode.type) {
    case "velocity":
      return "velocity"
    case "lyrics":
      return "lyrics"
    case "pitchBend":
      return "pitchBend"
    case "controller":
      return `controller-${controlMode.controllerType}`
  }
}

export const isEqualControlMode = (a: ControlMode, b: ControlMode) => {
  switch (a.type) {
    case "velocity":
    case "lyrics":
    case "pitchBend":
      return a.type === b.type
    case "controller":
      switch (b.type) {
        case "velocity":
        case "lyrics":
        case "pitchBend":
          return false
        case "controller":
          return ValueEventType.equals(a, b)
      }
  }
}

export const defaultControlModes: ControlMode[] = [
  {
    type: "velocity",
  },
  {
    type: "lyrics",
  },
  {
    type: "pitchBend",
  },
  {
    type: "controller",
    controllerType: MIDIControlEvents.MSB_MAIN_VOLUME,
  },
  {
    type: "controller",
    controllerType: MIDIControlEvents.MSB_PAN,
  },
  {
    type: "controller",
    controllerType: MIDIControlEvents.MSB_EXPRESSION,
  },
  {
    type: "controller",
    controllerType: MIDIControlEvents.SUSTAIN,
  },
  {
    type: "controller",
    controllerType: MIDIControlEvents.MSB_MODWHEEL,
  },
]
