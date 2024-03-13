const ConfigUtil = require("../src/ConfigUtil");
const fs = require("node:fs");
const { CONFIG_EXAMPLE_PATH } = require("../src/CONSTANTS");

fs.writeFileSync(CONFIG_EXAMPLE_PATH, ConfigUtil.make_cfg_string(), {
  encoding: "utf8",
});
