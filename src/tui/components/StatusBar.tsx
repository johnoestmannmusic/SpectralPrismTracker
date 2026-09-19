import { Box } from "ink";
import { MarqueeText } from "./Marquee";

interface Props {
  status: string;
  error: string | null;
  hint?: string;
  /** Columns available to each line; long lines marquee instead of truncating. */
  width?: number;
}

/** Collapses any multi-line status into a single line so the layout never grows. */
function oneLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, " · ").trim();
}

export function StatusBar({ status, error, hint, width = 120 }: Props) {
  return (
    <Box flexDirection="column">
      {error ? (
        <MarqueeText color="red" width={width} text={`✖ ${oneLine(error)}`} />
      ) : (
        <MarqueeText
          color="gray"
          width={width}
          text={status ? `• ${oneLine(status)}` : " "}
        />
      )}
      {hint ? (
        <MarqueeText dimColor width={width} text={oneLine(hint)} />
      ) : null}
    </Box>
  );
}
