const { COORDINATOR_MODULE_PATH } = require("./src/CONSTANTS");
const ConfigUtil = require("./src/ConfigUtil");
const StreamMultiplexer = require("./src/StreamMultiplexer");
const { resolve } = require("path");

(async () => {
  const args = process.argv.slice(2);
  const configPath = resolve(args[0] ?? "./config.js");
  console.log(`Using config file located at ${configPath}`);
  await ConfigUtil.interactive(configPath);
  const cfg = require(configPath);
  const log_sinks = cfg.log_sinks || [
    [
      "node",
      "./node_modules/logrotate-stream/bin/logrotate-stream",
      "./logs/caracAL.log.jsonl",
      "--keep",
      "3",
      "--size",
      "1500000",
    ],
    ["node", "./standalones/LogPrinter.js"],
  ];
  StreamMultiplexer.setup_log_pipes(
    log_sinks,
    COORDINATOR_MODULE_PATH,
    configPath,
  );
})();
