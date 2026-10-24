const { spawn } = require("node:child_process");
const { FANOUT_STDOUT } = require("./CONSTANTS");

function isCommandArray(command) {
  return (
    Array.isArray(command) &&
    command.length > 0 &&
    command.every((part) => typeof part === "string") &&
    command[0].length > 0
  );
}

function isDestination(value) {
    const isSpecialDestination = value === FANOUT_STDOUT
    return  isSpecialDestination || isCommandArray(value);
}

function parseDestinations(argv) {
  return argv.map((argument) => {
    const destinationCandidate = JSON.parse(argument);
    if (!isDestination(destinationCandidate)) {
      throw new Error(
        `Each destination must be "${FANOUT_STDOUT}" or a JSON array containing a command and string arguments`,
      );
    }
    return destinationCandidate;
  });
}

function openDestination(destination) {
  if (destination === FANOUT_STDOUT) return process.stdout;

  const [command, ...args] = destination;
  return spawn(command, args, {
    stdio: ["pipe", "inherit", "inherit"],
  }).stdin;
}

async function fanout(destinations, source = process.stdin) {
  return new Promise((resolve, reject) => {
    const outputs = destinations.map(openDestination);

    for (const output of outputs) {
      source.pipe(output);
    }
    //TODO all lifecycle handling, including promise termination
  });
}

fanout(parseDestinations(process.argv.slice(2)));
