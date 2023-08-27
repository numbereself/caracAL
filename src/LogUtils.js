const fs = require('node:fs');
const os = require("os");
const crypto = require("crypto");
const pino = require('pino');
const { Writable } = require('stream');
const { Console } = require('console');
const { resolve } = require("path");

//3 byte random ident base64 to 4 characters
//should suffice if you assume that instances arent changed often
const process_hash = crypto.randomBytes(3).toString("base64");

function get_git_revision() {
  try {
    const rev = fs.readFileSync('.git/HEAD').toString().trim();
    if (rev.indexOf(':') === -1) {
        return rev;
    } else {
        return fs.readFileSync('.git/' + rev.substring(5)).toString().trim();
    }
  } catch(err) {
    return "🤷‍♂️"
  }
}

const logger = pino({
  base:{"id":process_hash},
  level:process.env.LOG_LEVEL || "info"
  /*transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }*/
})

logger.warn({"type": "log_init"
  , "pid": process.pid
  , "cwd": resolve(".")
  , "hostname": os.hostname()
  , "os_release":os.release(), "os_platform":os.platform()
  , "git_revision":get_git_revision()}
  , "initializing logging");

class NullWritableStream extends Writable {
    constructor(options) {
        super(options);
    }

    _write(chunk, encoding, callback) {
        // Do nothing with the written data
        callback();
    }
}

function fakePinoConsole(baseLogger) {
  const result = new Console(new NullWritableStream());

  const console_levels_to_pino = {
    "debug":"debug",
    "info":"info",
    "log":"info",
    "warn":"warn",
    "error":"error",
    "_default":"info"
  }
  
  for(let key of Object.keys(result)) {
    const mapped_pino_level = console_levels_to_pino[key] 
      || console_levels_to_pino["_default"];
    result[key] = function (...args) {
      baseLogger[mapped_pino_level]
        ({"args":args, func:key, type:"console"});
    }
  }
  return result;
}

module.exports = {logger, fakePinoConsole};