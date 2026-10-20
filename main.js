const { COORDINATOR_MODULE_PATH } = require("./src/CONSTANTS");
const ConfigUtil = require("./src/ConfigUtil");
const StreamMultiplexer = require("./src/StreamMultiplexer");
const fs = require("fs");

async function get_webpack_started(cfg) {
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
      null,
    ];
    //Run webpack once so we are guaranteed to have the compiled files
    let wp_seed;
    console.log("Starting Initial WebPack");
    //initially we do not use log_pipes because when the process terminates it will close our stdin/out
    wp_seed = StreamMultiplexer.spawn_sink(
      "node",
      "./node_modules/webpack/bin/webpack",
      "--no-color",
    );

    await new Promise((resolve) => {
      wp_seed.on("close", resolve);
    });
    console.log("Initial WebPack is done");
    wp_seed = StreamMultiplexer.setup_log_pipes(
      webpack_log_output,
      "./node_modules/webpack/bin/webpack",
      "--no-color",
      "--watch",
    );
    return wp_seed;
  }
}

(async () => {
  await ConfigUtil.interactive();

  const cfg = require("./config");
  const webpack = await get_webpack_started(cfg);

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
  const coordinator = StreamMultiplexer.setup_log_pipes(
    log_sinks,
    COORDINATOR_MODULE_PATH,
  );
  // a signal to main.js (Ctrl-C, kill, a service manager) stops the coordinator, which stops the characters
  // a second signal kills it outright; the characters follow, as they stop when their coordinator is gone
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      coordinator.kill(stopping ? "SIGKILL" : "SIGTERM");
      stopping = true;
    });
  }
  coordinator.on("exit", (code) => {
    webpack?.kill();
    process.exit(code ?? 1);
  });
})();
