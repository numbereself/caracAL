const { COORDINATOR_MODULE_PATH, FANOUT_STDOUT } = require("./src/CONSTANTS");
const ConfigUtil = require("./src/ConfigUtil");
const fs = require("fs");
const { spawn } = require("node:child_process");

function spawnLogFanout(destinations) {
  const destinationArgs = destinations.map((command) =>
    JSON.stringify(command),
  );
  return spawn("node", ["./src/StreamFanout.js", ...destinationArgs], {
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function spawnWithOutput(command, args, output) {
  return spawn(command, args, {
    stdio: ["inherit", output, output],
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
    const watcher = spawnWithOutput(
      "node",
      ["./node_modules/webpack/bin/webpack", "--no-color", "--watch"],
      webpackFanout.stdin,
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
  const coordinator = spawnWithOutput(
    "node",
    [COORDINATOR_MODULE_PATH],
    logFanout.stdin,
  );
  // Release only our copy; the coordinator owns its inherited endpoints.
  logFanout.stdin.destroy();
  return coordinator;
}

(async () => {
  await ConfigUtil.interactive();

  const cfg = require("./config");
  const webpack = await startWebpack(cfg);
  const coordinator = startCoordinator(cfg);

  //TODO coordinate graceful termination on SIGINT etc
  //a cross-platform solution to this will require an ipc to coordinator for sending termination
  //TODO use automatic exit with code instead of manual hard exit
  coordinator.on("exit", (code) => {
    webpack?.kill();
    process.exit(code ?? 1);
  });
})();
