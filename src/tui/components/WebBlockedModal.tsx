import { Box, Text, useInput } from "ink";
import { isCancel } from "../keys";
import { PROJECT_URL } from "@/shared/links";

interface Props {
  onClose: () => void;
  width?: number;
}

/**
 * Shown on the web deployment for commands that need local filesystem access
 * (FEAT-163). Points the user at the desktop download via `/viewsource`'s URL.
 */
export function WebBlockedModal({ onClose, width = 80 }: Props) {
  useInput((char, key) => {
    if (isCancel(char, key)) onClose();
  });
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      alignSelf="flex-start"
      width={Math.max(40, Math.min(width, 90))}
    >
      <Text bold color="yellow">
        Not available in the web version
      </Text>
      <Text wrap="wrap">
        Opening, saving and restoring files needs local filesystem access, which
        the web build does not have. Download the desktop version to work with
        project files.
      </Text>
      <Text color="cyan" wrap="wrap">
        {PROJECT_URL}
      </Text>
      <Text dimColor>press x or esc to close</Text>
    </Box>
  );
}
