import styled from "@emotion/styled"
import { type FC, memo, useEffect, useState } from "react"

interface LyricsItemDisplayProps {
  x: number
  width: number
}

interface LyricsItemProps {
  lyrics: string
  onChange: (lyrics: string) => void
}

const Parent = styled.div<LyricsItemDisplayProps>`
  margin: 0;
  position: absolute;
  left: ${(props) => props.x}px;
  top: 0;
  bottom: 0;
  font-size: 1rem;
  display: flex;
  align-items: center;
`

const LyricsInput = styled.input`
  margin: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--color-divider);
  color: var(--color-text);
  outline: none;
  padding: 0 0.25rem;
  font-size: inherit;
  text-align: center;
`

const LyricsItem: FC<LyricsItemProps & LyricsItemDisplayProps> = ({
  lyrics,
  onChange,
  ...displayProps
}) => {
  // Event ids restart for each track, so React reuses this input when
  // another MIDI file is opened. Keep the text in local state and follow
  // external changes (file open, undo) instead of relying on defaultValue.
  const [value, setValue] = useState(lyrics)

  useEffect(() => {
    setValue(lyrics)
  }, [lyrics])

  return (
    <Parent {...displayProps}>
      <LyricsInput
        style={{ width: displayProps.width }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value !== lyrics) {
            onChange(value)
          }
        }}
      />
    </Parent>
  )
}

export default memo(LyricsItem)
