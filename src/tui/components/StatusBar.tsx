import { Box, Text } from "ink";

interface Props {
  status: string;
  error: string | null;
  hint?: string;
}

export function StatusBar({ status, error, hint }: Props) {
  return (
    <Box flexDirection="column">
      {error ? (
        <Text color="red">✖ {error}</Text>
      ) : (
        <Text color="gray">{status ? `• ${status}` : " "}</Text>
      )}
      {hint ? <Text dimColor>{hint}</Text> : null}
    </Box>
  );
}
