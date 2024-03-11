const { COORDINATOR_MODULE_PATH } = require("./src/CONSTANTS");
const ConfigUtil = require("./src/ConfigUtil");
const StreamMultiplexer = require("./src/StreamMultiplexer");
const fs = require("fs");

async function get_webpack_started(cfg) {
  fs.rmSync("./TYPECODE.out", { recursive: true });
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
        "1500000",
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
  }
}

(async () => {
  await ConfigUtil.interactive();

  const cfg = require("./config");
  await get_webpack_started(cfg);

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
  StreamMultiplexer.setup_log_pipes(log_sinks, COORDINATOR_MODULE_PATH);
})();
