#!/usr/bin/env node

const pump = require('pump')
const pino_pretty = require('pino-pretty');
const fs = require('fs')
const colorette = require('colorette');

const clid_to_colors = {
  1:colorette.gray
, 2:colorette.red
, 3:colorette.cyan
, 4:colorette.magenta
, 5:colorette.yellow
, 6:colorette.green
, 7:colorette.blue
};

const supported_msg_colors = {
  "gray":colorette.gray
, "red":colorette.red
, "cyan":colorette.cyan
, "magenta":colorette.magenta
, "yellow":colorette.yellow
, "green":colorette.green
, "blue":colorette.blue
};//no black or white, these are assumed to be console-theme-preference

const messageFormat = (log_object, messageKey) => {
  const {clid, cname, id, type, func, val, col} = log_object;
  const msg = log_object[messageKey];
  const msg_colors = supported_msg_colors[col];
  const char_colors = clid_to_colors[clid];
  const char_raw = ((cname || "caracAL")+ "            ").slice(0,12);
  const char_string = !cname
    ? colorette.bold(char_raw)
    : char_colors 
      ? char_colors(char_raw)
      : char_raw;
  const message_string = ("msg" in log_object)
    ? "> " + (msg_colors ? msg_colors(msg) : msg)
    : ("val" in log_object)
      ? " = " + (msg_colors ? msg_colors(val) : val)
      : ""
    return `${id} ${char_string} ${type}${func ? `.${func}()` : ""}${message_string}`;
  } 

const opts = {
  singleLine: true
  , errorLikeObjectKeys : 'err,error'
  , errorProps : ''
  , ignore: 'id,type,func,cname,clid'
  , messageFormat
};

const res = pino_pretty(opts)
pump(process.stdin, res)

if (!process.stdin.isTTY && !fs.fstatSync(process.stdin.fd).isFile()) {
  process.once('SIGINT', function noOp () {})
}