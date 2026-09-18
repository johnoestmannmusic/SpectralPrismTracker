import { Box, Text } from "ink";

export interface Suggestion {
  label: string;
  description?: string;
  /** Text inserted when Tab/Enter accepts this suggestion. */
  insert: string;
  /** Character index in the input where the replacement begins. */
  replaceFrom: number;
  /** Usage string shown for the highlighted command (e.g. `/seek <time>`). */
  usage?: string;
  /** Example invocation shown for the highlighted command. */
  example?: string;
  /** "recent" entries are de-duplicated from command history. */
  kind?: "recent" | "command" | "arg";
}

interface Props {
  input: string;
  active: boolean;
  placeholder: string;
  suggestions: Suggestion[];
  selected: number;
}

export function CommandBar({
  input,
  active,
  placeholder,
  suggestions,
  selected,
}: Props) {
  return (
    <Box flexDirection="column">
      {active && suggestions.length > 0 ? (
        <Box flexDirection="column" marginBottom={0}>
          {suggestions.map((suggestion, index) => (
            <Box key={`${suggestion.label}-${index}`}>
              <Text
                inverse={index === selected}
                color={index === selected ? undefined : "cyan"}
                dimColor={index !== selected}
              >
                {" "}
                {suggestion.label}
                {suggestion.label.length < 18
                  ? " ".repeat(18 - suggestion.label.length)
                  : " "}
              </Text>
              <Text dimColor={index !== selected}>
                {" "}
                {suggestion.kind === "recent"
                  ? `recent · ${suggestion.description ?? ""}`
                  : (suggestion.description ?? "")}
              </Text>
            </Box>
          ))}
          {suggestions[selected]?.usage ? (
            <Text dimColor wrap="truncate-end">
              {"   "}
              {suggestions[selected]!.usage}
              {suggestions[selected]!.example
                ? `  e.g. ${suggestions[selected]!.example}`
                : ""}
            </Text>
          ) : null}
        </Box>
      ) : null}
      <Box>
        <Text bold color={active ? "green" : "gray"}>
          {"› "}
        </Text>
        <Text>{input || (active ? "" : " ")}</Text>
        {active ? <Text inverse> </Text> : null}
        {!input ? <Text dimColor>{placeholder}</Text> : null}
      </Box>
    </Box>
  );
}
