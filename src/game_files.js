const fs = require("fs").promises;
const fs_sync = require("fs");
const { createWriteStream } = require("fs");
const { pipeline } = require("stream");
const { promisify } = require("util");
const streamPipeline = promisify(pipeline);
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const path = require("path");
const { console } = require("./LogUtils");
const { URL } = require("url");

function checkFileExists(filepath) {
  let flag = true;
  try {
    fs_sync.accessSync(filepath, fs.constants.F_OK);
  } catch (e) {
    flag = false;
  }
  return flag;
}

function getHostname(base_url) {
  return new URL(base_url).hostname;
}

function get_runner_files() {
  return [
    "/js/common_functions.js",
    "/js/runner_functions.js",
    "/js/runner_compat.js",
  ];
}
function get_game_files() {
  return [
    "/js/pixi/fake/pixi.min.js",
    "/js/libraries/combined.js",
    "/js/codemirror/fake/codemirror.js",

    "/js/common_functions.js",
    "/js/functions.js",
    "/js/game.js",
    "/js/html.js",
    "/js/payments.js",
    "/js/keyboard.js",
    "/data.js",
  ];
}

function get_all_client_files() {
  return (
    get_game_files()
      .concat(get_runner_files())
      //remove duplicates
      .filter(function (item, pos, self) {
        return self.indexOf(item) == pos;
      })
  );
}

async function cull_versions(base_url, exclusions) {
  const base_host_name = getHostname(base_url);
  const all_versions = await available_versions(base_url);
  const target_culls = all_versions.filter(
    (x, i) => i >= 2 && !exclusions.includes(x),
  );
  for (let cull of target_culls) {
    try {
      console.log("culling version " + cull);
      await fs.rmdir(`./game_files/${base_host_name}/${cull}`, {
        recursive: true,
      });
    } catch (e) {
      console.warn("failed to cull version " + cull, e);
    }
  }
}

async function available_versions(base_url) {
  return (
    await fs.readdir("./game_files/" + getHostname(base_url), {
      withFileTypes: true,
    })
  )
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((x) => x.match(/^\d+$/))
    .map((x) => parseInt(x))
    .sort()
    .reverse();
}

async function download_file(url, file_p) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`failed to download ${url}: ${response.statusText}`);
  }

  return await streamPipeline(response.body, createWriteStream(file_p));
}

async function get_latest_version(base_url) {
  const raw = await fetch(base_url);
  if (!raw.ok) {
    throw new Error(`failed to check version: ${raw.statusText}`);
  }
  const html = await raw.text();
  const match = /game\.js\?v=([0-9]+)"/.exec(html);
  if (!match) {
    throw new Error(`malformed version response`);
  }
  return parseInt(match[1]);
}

function locate_game_file(base_url, resource, version) {
  const base_host_name = getHostname(base_url);
  const file_name = path.posix.basename(resource);
  return `./game_files/${base_host_name}/${version}/${file_name}`;
}

async function ensure_latest(base_url) {
  const base_host_name = getHostname(base_url);
  const version = await get_latest_version(base_url);
  //TODO check if the version has all files and possibly redownload
  //TODO ensure that the folder we are accessing exists

  const fpath = `./game_files/${base_host_name}/${version}`;

  await fs.mkdir(fpath, { recursive: true });
  const target_files = get_all_client_files().filter(
    (resource) =>
      !checkFileExists(locate_game_file(base_url, resource, version)),
  );
  if (target_files.length == 0) {
    console.log("all files for version " + version + " are present");
  } else {
    console.log("downloading game files for version " + version, target_files);
  }
  const tasks = target_files.map((itm) =>
    download_file(base_url + itm, locate_game_file(base_url, itm, version)),
  );
  await Promise.all(tasks);

  return version;
}
exports.cull_versions = cull_versions;
exports.available_versions = available_versions;
exports.ensure_latest = ensure_latest;
exports.locate_game_file = locate_game_file;
exports.get_runner_files = get_runner_files;
exports.get_game_files = get_game_files;
