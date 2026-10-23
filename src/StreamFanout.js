const { spawn } = require("node:child_process");

function isCommandArray(command) {
  return (
    Array.isArray(command) &&
    command.length > 0 &&
    command.every((part) => typeof part === "string") &&
    command[0].length > 0
  );
}

function parseDestinations(argv) {
  return argv.map((argument) => {
    const command = JSON.parse(argument);
    if (!isCommandArray(command)) {
      throw new Error(
        "Each destination must be a JSON array containing a command and string arguments",
      );
    }
    return command;
  });
}

async function fanout(destinations, source = process.stdin) {
  return new Promise((resolve, reject) => {
    const processes = destinations.map(([command, ...args]) =>
      spawn(command, args, {
        stdio: ["pipe", "inherit", "inherit"],
      }),
    );

    for (const destination of processes) {
      source.pipe(destination.stdin);
    }
    //TODO all lifecycle handling, including promise termination
  });
}

fanout(parseDestinations(process.argv.slice(2)));
