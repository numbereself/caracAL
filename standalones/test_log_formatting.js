const { spawn } = require("node:child_process");

const destinations = [["node", "./standalones/LogPrinter.js"]];
const destinationArgs = destinations.map((command) => JSON.stringify(command));
const logFanout = spawn(
  "node",
  ["./src/StreamFanout.js", ...destinationArgs],
  { stdio: ["pipe", "inherit", "inherit"] },
);

spawn("node", ["./standalones/test_logging.js"], {
  stdio: ["inherit", logFanout.stdin, logFanout.stdin],
});
logFanout.stdin.destroy();
