const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { FANOUT_STDOUT, SHUTDOWN_SIGNALS } = require("./CONSTANTS");
const { finished } = require("node:stream/promises");

// Both deadlines start on the first shutdown signal or when draining begins.
const STREAM_SHUTDOWN_TIMEOUT_MS = 5_000;
const PROCESS_SHUTDOWN_TIMEOUT_MS = 6_000;
const SINK_STREAM_COMPLETE = Symbol("SINK_STREAM_COMPLETE");

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

function getSpecialSinkStreams(destinations) {
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
  const processStartupTasks = children.map(async (child) => {
    await once(child, "spawn");
    return child;
  });
  const startupResults = await Promise.allSettled(processStartupTasks);
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
  const processSinkStreams = children.map((child) => child.stdin);
  const specialSinkStreams = getSpecialSinkStreams(destinations);
  const sinkStreams = [...processSinkStreams, ...specialSinkStreams];

  let firstError = null;
  let streamShutdownTimer = null;
  let processTimeoutTask = null;
  const { promise: streamTimeoutTask, reject: rejectStreamTimeout } =
    Promise.withResolvers();

  function recordError(err) {
    if (firstError == null && err != null) {
      firstError = err;
    }
  }

  function scheduleShutdownDeadlines() {
    if (streamShutdownTimer != null) return;
    streamShutdownTimer = setTimeout(() => {
      rejectStreamTimeout(new Error("Timed out draining sink streams"));
    }, STREAM_SHUTDOWN_TIMEOUT_MS).unref();
    processTimeoutTask = new Promise((resolve) => {
      setTimeout(() => resolve(), PROCESS_SHUTDOWN_TIMEOUT_MS).unref();
    });
  }

  const sourceTask = finished(source, {
    readable: true,
    writable: false,
    cleanup: true,
  });

  const sinkStreamCompletedTasks = sinkStreams.map((sinkStream) =>
    finished(sinkStream, {
      readable: false,
      writable: true,
      cleanup: true,
    }).then(
      () => SINK_STREAM_COMPLETE,
      (err) => {
        sinkStream.destroy();
        throw err;
      },
    ),
  );

  const onShutdownSignal = () => scheduleShutdownDeadlines();
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, onShutdownSignal);
  }

  for (const sinkStream of sinkStreams) {
    source.pipe(sinkStream, { end: false });
  }
  if (sinkStreams.length === 0) {
    source.resume();
  }

  try {
    const firstStreamCompletion = await Promise.race([
      streamTimeoutTask,
      sourceTask,
      ...sinkStreamCompletedTasks,
    ]);
    if (firstStreamCompletion === SINK_STREAM_COMPLETE)
      throw new Error("Sink stream finished before source");
  } catch (err) {
    recordError(err);
  }

  scheduleShutdownDeadlines();
  source.unpipe();
  source.destroy();
  for (const sinkStream of sinkStreams) {
    if (!sinkStream.destroyed && !sinkStream.writableEnded) {
      sinkStream.end();
    }
  }

  try {
    const allSinkStreamsSettled = Promise.allSettled(sinkStreamCompletedTasks);
    await Promise.race([allSinkStreamsSettled, streamTimeoutTask]);
    const sinkStreamsCompletedSuccessfully = Promise.all(
      sinkStreamCompletedTasks,
    );
    await sinkStreamsCompletedSuccessfully;
  } catch (err) {
    recordError(err);
  }

  clearTimeout(streamShutdownTimer);
  for (const sinkStream of sinkStreams) {
    sinkStream.destroy();
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
