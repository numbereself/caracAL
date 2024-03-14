const fs = require("fs").promises;
const { createWriteStream } = require("fs");
const { pipeline } = require("stream");
const { promisify } = require("util");
const streamPipeline = promisify(pipeline);
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const path = require("path");
const { console } = require("./src/LogUtils");

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

async function cull_versions(exclusions) {
  const all_versions = await available_versions();
  const target_culls = all_versions.filter(
    (x, i) => i >= 2 && !exclusions.includes(x),
  );
  for (let cull of target_culls) {
    try {
      console.log("culling version " + cull);
      await fs.rmdir("./game_files/" + cull, { recursive: true });
    } catch (e) {
      console.warn("failed to cull version " + cull, e);
    }
  }
}

async function available_versions() {
  return (await fs.readdir("./game_files", { withFileTypes: true }))
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

function locate_game_file(resource, version) {
  return `./game_files/${version}/${path.posix.basename(resource)}`;
}

async function ensure_latest(base_url) {
  const version = await get_latest_version(base_url);
  if ((await available_versions()).includes(version)) {
    console.log(`version ${version} is already downloaded`);
  } else {
    console.log(`downloading version ${version}`);
    const fpath = "./game_files/" + version;
    try {
      await fs.mkdir(fpath);
      const target_files = get_game_files()
        .concat(get_runner_files())
        //remove duplicates
        .filter(function (item, pos, self) {
          return self.indexOf(item) == pos;
        });
      const tasks = target_files.map((itm) =>
        download_file(base_url + itm, locate_game_file(itm, version)),
      );
      await Promise.all(tasks);
    } catch (e) {
      await fs.rmdir(fpath, { recursive: true });
      throw e;
    }
  }
  return version;
}
exports.cull_versions = cull_versions;
exports.available_versions = available_versions;
exports.ensure_latest = ensure_latest;
exports.locate_game_file = locate_game_file;
exports.get_runner_files = get_runner_files;
exports.get_game_files = get_game_files;
