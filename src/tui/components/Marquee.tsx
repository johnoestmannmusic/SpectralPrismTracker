import { Text } from "ink";
import { useEffect, useState } from "react";

/** Number of blank columns inserted between the end and the wrap-around. */
const GAP = "   ";

/**
 * A horizontal window into `text` (FEAT-136). When the text fits it is returned
 * unchanged; otherwise a moving window wraps around with a small gap. Exported
 * separately so tests and StepPanel can use it without mounting React.
 */
export function marqueeSlice(
  text: string,
  width: number,
  offset: number,
): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  const full = `${text}${GAP}`;
  const position = ((offset % full.length) + full.length) % full.length;
  return (full + full).slice(position, position + width);
}

interface Props {
  text: string;
  /** Columns available to the field. */
  width: number;
  color?: string;
  backgroundColor?: string;
  dimColor?: boolean;
  bold?: boolean;
}

/**
 * Renders `text` in a fixed-width field, marquee-scrolling it only when it
 * overflows. Replaces `wrap="truncate-end"` on user-facing strings so long
 * values never sit permanently truncated behind an ellipsis.
 */
export function MarqueeText({
  text,
  width,
  color,
  backgroundColor,
  dimColor,
  bold,
}: Props) {
  const overflow = text.length > width;
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!overflow) {
      setOffset(0);
      return;
    }
    const timer = setInterval(() => setOffset((value) => value + 1), 140);
    return () => clearInterval(timer);
  }, [overflow, text]);

  return (
    <Text
      color={color}
      backgroundColor={backgroundColor}
      dimColor={dimColor}
      bold={bold}
      wrap="truncate-end"
    >
      {marqueeSlice(text, width, offset)}
    </Text>
  );
}
