import { Box, Text } from "ink";

interface Props {
  status: string;
  error: string | null;
  hint?: string;
}

/** Collapses any multi-line status into a single line so the layout never grows. */
function oneLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, " · ").trim();
}

export function StatusBar({ status, error, hint }: Props) {
  return (
    <Box flexDirection="column">
      {error ? (
        <Text color="red" wrap="truncate-end">
          ✖ {oneLine(error)}
        </Text>
      ) : (
        <Text color="gray" wrap="truncate-end">
          {status ? `• ${oneLine(status)}` : " "}
        </Text>
      )}
      {hint ? (
        <Text dimColor wrap="truncate-end">
          {oneLine(hint)}
        </Text>
      ) : null}
    </Box>
  );
}
