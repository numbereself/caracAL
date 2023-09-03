const fs = require('node:fs');
const os = require("os");
const crypto = require("crypto");
const pino = require('pino');
const { Writable } = require('stream');
const console = require('console');
const { resolve } = require("path");
const util = require('node:util'); 

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

let config = null;
try {
  config = require("../config");
} catch(err) {} 
let level = config ? (config.log_level || "info") : "silent";

let log = pino({
  base:{"id":process_hash
    ,"type":"unspecified"},
  level
});

log.warn({"type": "log_init"
  , "pid": process.pid
  , "node_executable" : process.execPath
  , "node_versions": process.versions
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
  //if no config exists we do not provide structured logging
  if(baseLogger == null) {
    if(!config) {
      return console;
    }
    baseLogger = log;
  }
  const result = new console.Console(new NullWritableStream());

  const console_levels_to_pino = {
    "debug":"debug",
    "info":"info",
    "log":"info",
    "warn":"warn",
    "error":"error",
  }
  const fallback_level = "info";
  
  for(let key of Object.keys(result)) {
    const sub_logger = baseLogger.child({ type:"console",func: key });
    const mapped_pino_level = console_levels_to_pino[key];
    result[key] = mapped_pino_level 
      ? function (template, ...args) {
        sub_logger[mapped_pino_level]
            ({"args":args}, util.format(template, ...args)) 
        }
      : function (...args) {
        sub_logger[fallback_level]
          ({"args":args});
    }
  }
  return result;
}

const ctype_to_clid = {
  "merchant":1
  , "warrior":2
  , "paladin":3
  , "priest":4
  , "ranger":5
  , "rogue":6
  , "mage":7
}

module.exports = {
  get log() { return log; }
  , set log(val) { return log = val; }
  , get console() { return fakePinoConsole(); }
  , fakePinoConsole, ctype_to_clid};