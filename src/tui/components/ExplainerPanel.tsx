import { Box, Text } from "ink";
import type { ExplainerText } from "../explainer";

interface Props {
  content: ExplainerText;
  width: number;
  height: number;
}

/**
 * Persistent right-hand explainer, the TUI equivalent of the original app's
 * sidebar card. It shows what the current selection (tracker cell or menu row)
 * represents, replacing pointer hover with cursor-driven updates.
 */
export function ExplainerPanel({ content, width, height }: Props) {
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      overflow="hidden"
    >
      <Text bold color="cyan" wrap="wrap">
        {content.title}
      </Text>
      <Text wrap="wrap">{content.body}</Text>
    </Box>
  );
}

export type { ExplainerText };
