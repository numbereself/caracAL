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

function isSpecialDestination(value) {
  return value === FANOUT_STDOUT;
}

function isDestination(value) {
  return isSpecialDestination(value) || isCommandArray(value);
}

function getSpecialOutputs(destinations) {
  return destinations.filter(isSpecialDestination).map(() => process.stdout);
}

function spawnDestinationProcess(destination) {
  return new Promise((resolve, reject) => {
    const [command, ...args] = destination;
    const spawnedProcess = spawn(command, args, {
      stdio: ["pipe", "inherit", "inherit"],
    });
    const onStartupError = (err) => reject(err);
    spawnedProcess.once("error", onStartupError);
    spawnedProcess.once("spawn", () => {
      spawnedProcess.off("error", onStartupError);
      resolve(spawnedProcess);
    });
  });
}

async function openProcessOutputs(destinations) {
  const startProcessTasks = destinations
    .filter(isCommandArray)
    .map(spawnDestinationProcess);
  const startupResults = await Promise.allSettled(startProcessTasks);
  const startedProcesses = startupResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const startupErrors = startupResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (startupErrors.length > 0) {
    for (const child of startedProcesses) {
      child.kill("SIGKILL");
    }
    throw new AggregateError(
      startupErrors,
      "Failed to spawn all log processes",
    );
  }
  return startedProcesses.map((child) => child.stdin);
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

async function fanout(destinations, source = process.stdin) {
  const processOutputs = await openProcessOutputs(destinations);
  const specialOutputs = getSpecialOutputs(destinations);
  const outputs = [...processOutputs, ...specialOutputs];

  return new Promise((resolve, reject) => {
    for (const output of outputs) {
      source.pipe(output);
    }
    //TODO all lifecycle handling, including promise termination
  });
}

fanout(parseDestinations(process.argv.slice(2)));
