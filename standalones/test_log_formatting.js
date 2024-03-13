const StreamMultiplexer = require("../src/StreamMultiplexer");

StreamMultiplexer.setup_log_pipes(
  [["node", "./standalones/LogPrinter.js"]],
  "./standalones/test_logging",
);
