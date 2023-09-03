const { COORDINATOR_MODULE_PATH } = require("./src/CONSTANTS");
const ConfigUtil = require("./src/ConfigUtil");
const StreamMultiplexer = require("./src/StreamMultiplexer");

(async() => {
  await ConfigUtil.interactive();
  const cfg = require("./config");
  StreamMultiplexer.setup_log_pipes(cfg.log_sinks, COORDINATOR_MODULE_PATH);
})();