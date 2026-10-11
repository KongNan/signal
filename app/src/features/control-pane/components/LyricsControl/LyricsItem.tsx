import styled from "@emotion/styled"
import { type FC, memo } from "react"

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
  return (
    <Parent {...displayProps}>
      <LyricsInput
        style={{ width: displayProps.width }}
        onBlur={(e) => onChange(e.target.value)}
        defaultValue={lyrics}
      />
    </Parent>
  )
}

export default memo(LyricsItem)
