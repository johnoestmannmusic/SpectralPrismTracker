import { Box, Text } from "ink";
import type { CommandDef } from "../commands/types";

interface Props {
  commands: CommandDef[];
}

export function HelpOverlay({ commands }: Props) {
  const categories = new Map<string, CommandDef[]>();
  for (const command of commands) {
    const list = categories.get(command.category) ?? [];
    list.push(command);
    categories.set(command.category, list);
  }
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
    >
      <Text bold color="green">
        Lantern commands
      </Text>
      <Text dimColor>esc to close · type / to run · tab to complete</Text>
      {Array.from(categories.entries()).map(([category, list]) => (
        <Box key={category} flexDirection="column" marginTop={1}>
          <Text bold color="cyan">
            {category}
          </Text>
          {list
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((command) => {
              const args = (command.args ?? [])
                .map((arg) =>
                  arg.required ? `<${arg.name}>` : `[${arg.name}]`,
                )
                .join(" ");
              return (
                <Box key={command.id}>
                  <Text color="green">
                    /{command.name}
                    {args ? ` ${args}` : ""}
                  </Text>
                  <Text dimColor>
                    {"  "}
                    {command.description}
                  </Text>
                </Box>
              );
            })}
        </Box>
      ))}
    </Box>
  );
}
