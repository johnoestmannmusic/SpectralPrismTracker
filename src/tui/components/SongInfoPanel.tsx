import { Box, Text } from "ink";
import type { SessionState } from "../session";

interface Props {
  state: SessionState;
  /** Stepthrough parameter to mark. */
  highlight?: Array<{ group?: string; label?: string }>;
}

function Field({
  label,
  value,
  marked,
}: {
  label: string;
  value: string;
  marked: boolean;
}) {
  return (
    <Box>
      <Text
        color={marked ? "yellow" : undefined}
        bold={marked}
        wrap="truncate-end"
      >
        {(marked ? "◆ " : "  ") + label.padEnd(10)}
      </Text>
      <Text wrap="truncate-end">{value || "—"}</Text>
    </Box>
  );
}

/** Compact song/timing summary used by the stepthrough Song chapter. */
export function SongInfoPanel({ state, highlight }: Props) {
  const project = state.project;
  const song = state.song;
  const marked = (label: string): boolean =>
    highlight?.some((h) => h.label === label) ?? false;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
    >
      <Text bold color="green">
        Song
      </Text>
      {!song || !project ? (
        <Text dimColor>(no song loaded)</Text>
      ) : (
        <Box flexDirection="column">
          <Field
            label="Title"
            value={project.songTitle}
            marked={marked("Title")}
          />
          <Field
            label="Artist"
            value={project.artist}
            marked={marked("Artist")}
          />
          <Field label="Album" value={project.album} marked={marked("Album")} />
          <Field
            label="Comments"
            value={project.comments}
            marked={marked("Comments")}
          />
          <Box marginTop={1}>
            <Text color={marked("Timing") ? "yellow" : undefined} bold>
              {marked("Timing") ? "◆ " : "  "}
              {`Timing · ${song.meta.tickRate.toFixed(1)}Hz · speed ${
                song.meta.speedPattern[0] ?? "—"
              } · beat ${song.meta.highlightA}/bar ${song.meta.highlightB}`}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
