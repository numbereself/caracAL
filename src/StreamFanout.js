const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { FANOUT_STDOUT, SHUTDOWN_SIGNALS } = require("./CONSTANTS");
const { finished } = require("node:stream/promises");

// Both deadlines start on the first shutdown signal or when draining begins.
const STREAM_SHUTDOWN_TIMEOUT_MS = 5_000;
const PROCESS_SHUTDOWN_TIMEOUT_MS = 6_000;

function isCommandArray(command) {
  return (
    Array.isArray(command) &&
    command.length > 0 &&
    command.every((part) => typeof part === "string" && !part.includes("\0")) &&
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

function spawnDestinationProcesses(destinations) {
  return destinations.filter(isCommandArray).map(([command, ...args]) =>
    spawn(command, args, {
      stdio: ["pipe", "inherit", "inherit"],
    }),
  );
}

async function waitForProcessStartup(children) {
  const startProcessTasks = children.map(async (child) => {
    await once(child, "spawn");
    return child;
  });
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
  return startedProcesses;
}

function waitForProcessExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
  });
}

function parseDestinations(argv) {
  return argv.map((argument) => {
    const destinationCandidate = JSON.parse(argument);
    if (!isDestination(destinationCandidate)) {
      throw new Error(
        `Each destination must be "${FANOUT_STDOUT}" or a JSON array containing a command and string arguments without null bytes`,
      );
    }
    return destinationCandidate;
  });
}

async function fanout(destinations, source = process.stdin) {
  const children = spawnDestinationProcesses(destinations);
  await waitForProcessStartup(children);
  const processOutputs = children.map((child) => child.stdin);
  const specialOutputs = getSpecialOutputs(destinations);
  const outputs = [...processOutputs, ...specialOutputs];

  let isFinishing = false;
  let firstError = null;
  let streamShutdownTimer = null;
  let processTimeoutTask = null;
  const { promise: streamTimeoutTask, resolve: resolveStreamTimeout } =
    Promise.withResolvers();

  function recordError(err) {
    if (firstError == null && err != null) {
      firstError = err;
    }
  }

  function scheduleShutdownDeadlines() {
    if (streamShutdownTimer != null) return;
    streamShutdownTimer = setTimeout(() => {
      beginDraining(new Error("Timed out draining output streams"));
      resolveStreamTimeout();
    }, STREAM_SHUTDOWN_TIMEOUT_MS).unref();
    processTimeoutTask = new Promise((resolve) => {
      setTimeout(() => resolve(), PROCESS_SHUTDOWN_TIMEOUT_MS).unref();
    });
  }
  function beginDraining(err) {
    //TODO this would be easier to read if draining was a promise
    //and this promise was read before cleanup and did all these ops
    //we might not even need to represent the promise explicitly.
    recordError(err);
    if (isFinishing) return;
    isFinishing = true;
    scheduleShutdownDeadlines();
    source.unpipe();
    source.destroy();

    for (const output of outputs) {
      if (!output.destroyed && !output.writableEnded) {
        output.end();
      }
    }
  }

  const sourceTask = finished(source, {
    readable: true,
    writable: false,
    cleanup: true,
  }).then(
    () => beginDraining(),
    (err) => beginDraining(err),
  );

  const waitForShutdownTasks = outputs.map((output) =>
    finished(output, {
      readable: false,
      writable: true,
      cleanup: true,
    }).then(
      () => {
        if (!isFinishing)
          beginDraining(new Error("Output finished before input"));
      },
      (err) => {
        output.destroy();
        beginDraining(err);
      },
    ),
  );

  const onShutdownSignal = () => scheduleShutdownDeadlines();
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, onShutdownSignal);
  }

  for (const output of outputs) {
    source.pipe(output, { end: false });
  }
  if (outputs.length === 0) {
    source.resume();
  }

  await Promise.race([
    Promise.all([sourceTask, ...waitForShutdownTasks]),
    streamTimeoutTask,
  ]);
  clearTimeout(streamShutdownTimer);
  for (const output of outputs) {
    output.destroy();
  }

  const processExitTask = Promise.all(children.map(waitForProcessExit));
  await Promise.race([processExitTask, processTimeoutTask]);
  for (const signal of SHUTDOWN_SIGNALS) {
    process.off(signal, onShutdownSignal);
  }
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      recordError(new Error("Timeout for exiting log processes"));
      child.kill("SIGKILL");
    } else if (child.signalCode !== null) {
      recordError(
        new Error(`Log process terminated by signal ${child.signalCode}`),
      );
    } else if (child.exitCode !== 0) {
      recordError(new Error(`Log process exited with code ${child.exitCode}`));
    }
  }

  if (firstError != null) throw firstError;
}

fanout(parseDestinations(process.argv.slice(2))).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
