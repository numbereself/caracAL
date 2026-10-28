const {
  COORDINATOR_MODULE_PATH,
  FANOUT_STDOUT,
  SHUTDOWN_SIGNALS,
  IPC_TERMINATE,
} = require("./src/CONSTANTS");
const ConfigUtil = require("./src/ConfigUtil");
const fs = require("fs");
const { spawn } = require("node:child_process");

// Coordinator budget from REFACTORING.md; logging must outlive its source.
const COORDINATOR_SHUTDOWN_TIMEOUT_MS = 4_000;

function spawnLogFanout(destinations) {
  const destinationArgs = destinations.map((command) =>
    JSON.stringify(command),
  );
  return spawn("node", ["./src/StreamFanout.js", ...destinationArgs], {
    stdio: ["pipe", "inherit", "inherit"],
  });
}

async function startWebpack(cfg) {
  try {
    fs.rmSync("./TYPECODE.out", { recursive: true });
  } catch (error) {
    //Sometimes throws if file doesnt exist
    //We want it to not exist, so we ignore it
  }
  if (cfg.enable_TYPECODE) {
    //TODO make this configurable
    const webpack_log_output = [
      [
        "node",
        "./node_modules/logrotate-stream/bin/logrotate-stream",
        "./logs/webpack.log",
        "--keep",
        "3",
        "--size",
        "4500000",
      ],
      FANOUT_STDOUT,
    ];
    //Run webpack once so we are guaranteed to have the compiled files
    console.log("Starting Initial WebPack");
    const initialBuild = spawn(
      "node",
      ["./node_modules/webpack/bin/webpack", "--no-color"],
      { stdio: "inherit" },
    );

    await new Promise((resolve) => {
      initialBuild.on("close", resolve);
    });
    console.log("Initial WebPack is done");
    const webpackFanout = spawnLogFanout(webpack_log_output);
    const watcher = spawn(
      "node",
      ["./node_modules/webpack/bin/webpack", "--no-color", "--watch"],
      { stdio: ["inherit", webpackFanout.stdin, webpackFanout.stdin] },
    );
    webpackFanout.stdin.destroy();
    return watcher;
  }
}

function startCoordinator(cfg) {
  const log_sinks = cfg.log_sinks || [
    [
      "node",
      "./node_modules/logrotate-stream/bin/logrotate-stream",
      "./logs/caracAL.log.jsonl",
      "--keep",
      "3",
      "--size",
      "4500000",
    ],
    ["node", "./standalones/LogPrinter.js"],
  ];
  const logFanout = spawnLogFanout(log_sinks);
  const coordinator = spawn("node", [COORDINATOR_MODULE_PATH], {
    stdio: ["inherit", logFanout.stdin, logFanout.stdin, "ipc"],
  });
  // Release only our copy; the coordinator owns its inherited endpoints.
  logFanout.stdin.destroy();
  return coordinator;
}

(async () => {
  await ConfigUtil.interactive();

  const cfg = require("./config");
  const webpack = await startWebpack(cfg);
  const coordinator = startCoordinator(cfg);

  //TODO use automatic exit with code instead of manual hard exit
  //TODO beautifying this class like StreamFanout should be done eventually
  //this would include a well-thought-out concept like StreamFanout too

  let isStopping = false;
  let shutdownTimer;
  const onShutdownSignal = () => {
    if (isStopping) return;
    isStopping = true;
    shutdownTimer = setTimeout(
      () => coordinator.kill("SIGKILL"),
      COORDINATOR_SHUTDOWN_TIMEOUT_MS,
    ).unref();
    if (coordinator.connected) {
      coordinator.send({ type: IPC_TERMINATE }, (err) => {
        // If IPC fails, the deadline still enforces termination.
        if (err)
          console.error("Failed to request coordinator termination:", err);
      });
    }
  };
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, onShutdownSignal);
  }
  coordinator.on("exit", (code) => {
    clearTimeout(shutdownTimer);
    webpack?.kill();
    process.exit(code ?? 1);
  });
})();
