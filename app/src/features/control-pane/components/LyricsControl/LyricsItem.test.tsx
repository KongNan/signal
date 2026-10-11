import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import LyricsItem from "./LyricsItem"

const renderLyricsItem = (lyrics: string, onChange = vi.fn()) => {
  render(<LyricsItem lyrics={lyrics} onChange={onChange} x={0} width={100} />)
  const input = screen.getByRole("textbox") as HTMLInputElement
  return { input, onChange }
}

describe("LyricsItem", () => {
  it("shows the lyrics prop", () => {
    const { input } = renderLyricsItem("la")
    expect(input.value).toBe("la")
  })

  it("follows external lyrics changes (opening another MIDI file, undo)", () => {
    // Event ids restart for each track, so the component is re-rendered
    // with a different song's lyric under the same React key.
    const view = render(
      <LyricsItem lyrics="la" onChange={vi.fn()} x={0} width={100} />,
    )
    view.rerender(
      <LyricsItem lyrics="sol" onChange={vi.fn()} x={0} width={100} />,
    )
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("sol")
  })

  it("commits the edited text on blur", () => {
    const onChange = vi.fn()
    const { input } = renderLyricsItem("la", onChange)

    fireEvent.change(input, { target: { value: "sol" } })
    fireEvent.focusOut(input)

    expect(onChange).toHaveBeenCalledWith("sol")
  })

  it("does not commit when nothing changed", () => {
    const onChange = vi.fn()
    const { input } = renderLyricsItem("la", onChange)

    fireEvent.focusOut(input)

    expect(onChange).not.toHaveBeenCalled()
  })
})
