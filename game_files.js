const base_url = "https://adventure.land";
const fs = require("fs").promises;
const { createWriteStream, readFileSync } = require("fs");
const { pipeline } = require("stream");
const { promisify } = require("util");
const streamPipeline = promisify(pipeline);
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const posix_path = require("path").posix;
const { console } = require("./src/LogUtils");

//vendor scripts the game page loads that we leave out: the node context
//provides its own jquery/io/bowser, the rest only matter with a real browser
const SKIPPED_SCRIPT_PATTERNS = [
  /^\/js\/pixi-/,
  /^\/js\/socket\.io\//,
  /^\/js\/jquery\//,
  /^\/js\/howler\//,
  /^\/js\/libraries\/(jquery|bowser)/,
  /^\/js\/codemirror\/(?!.*\/codemirror\.js$)/,
  /^\/js\/ios-drag-drop\.js$/,
];
//vendor scripts the game code needs to exist, swapped for the no-op versions
//the server hosts
const SCRIPT_SUBSTITUTIONS = [
  [/^\/js\/pixi\/[^/]+\/pixi\.min\.js$/, "/js/pixi/fake/pixi.min.js"],
  [
    /^\/js\/codemirror\/[^/]+\/codemirror\.js$/,
    "/js/codemirror/fake/codemirror.js",
  ],
];

//runner scripts are still selected explicitly, in evaluation order
const LEGACY_RUNNER_SCRIPT_PATHS = [
  "/js/old_common_functions.js",
  "/js/common_functions.js",
  "/js/runner_functions.js",
  "/js/runner_compat.js",
];

//game scripts for versions downloaded before manifests existed
const LEGACY_GAME_SCRIPT_PATHS = [
  "/js/pixi/fake/pixi.min.js",
  "/js/libraries/combined.js",
  "/js/codemirror/fake/codemirror.js",
  "/js/old_common_functions.js",
  "/js/common_functions.js",
  "/js/functions.js",
  "/js/generated_zones.js",
  "/js/entity_animations.js",
  "/js/npc_obstruction_hint.js",
  "/js/tavern_poker.js",
  "/js/tavern_slots.js",
  "/js/tavern_wheel.js",
  "/js/merrit_stand_notice.js",
  "/js/phrases.js",
  "/phrases/en.js",
  "/js/game.js",
  "/js/html.js",
  "/js/payments.js",
  "/js/keyboard.js",
  "/data.js",
];

function get_runner_files() {
  return LEGACY_RUNNER_SCRIPT_PATHS;
}

//the script tags of the game page, in page order
function parse_game_files(html) {
  const script_src_pattern = /<script[^>]*\ssrc="([^"]+)"/g;
  const result = [];
  for (const match of html.matchAll(script_src_pattern)) {
    let src = match[1].split("?")[0];
    if (
      !src.startsWith("/") ||
      SKIPPED_SCRIPT_PATTERNS.some((x) => x.test(src))
    ) {
      continue;
    }
    for (const [pattern, replacement] of SCRIPT_SUBSTITUTIONS) {
      if (pattern.test(src)) src = replacement;
    }
    if (!result.includes(src)) result.push(src);
  }
  //game files are stored flat, see locate_game_file
  const basenames = result.map((x) => posix_path.basename(x));
  const clash = basenames.find((x, i) => basenames.indexOf(x) != i);
  if (clash) {
    throw new Error(`game files share the file name ${clash}`);
  }
  return result;
}

function get_game_files(version) {
  try {
    const current_manifest = JSON.parse(
      readFileSync(locate_manifest(version), "utf8"),
    );
    return current_manifest.game_files;
  } catch (e) {
    if (e.code != "ENOENT") throw e;
  }
  return LEGACY_GAME_SCRIPT_PATHS;
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
    .sort((a, b) => Number(b) - Number(a));
}

async function download_file(url, file_p) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`failed to download ${url}: ${response.statusText}`);
  }

  //write aside and rename, so a file only exists once it is complete
  await streamPipeline(response.body, createWriteStream(file_p + ".part"));
  await fs.rename(file_p + ".part", file_p);
}

async function file_exists(file_p) {
  try {
    await fs.access(file_p);
    return true;
  } catch (e) {
    return false;
  }
}

function parse_game_version(html) {
  const version_match = /game\.js\?v=([0-9]+)"/.exec(html);
  if (!version_match) {
    throw new Error(`malformed version response`);
  }
  return version_match[1];
}

async function get_latest_manifest() {
  const response = await fetch(base_url);
  if (!response.ok) {
    throw new Error(`failed to check version: ${response.statusText}`);
  }
  const html = await response.text();
  return {
    version: parse_game_version(html),
    game_files: parse_game_files(html),
  };
}

function locate_game_file(resource, version) {
  return posix_path.join(
    "./game_files",
    version,
    posix_path.basename(resource),
  );
}

function locate_manifest(version) {
  return locate_game_file("manifest.json", version);
}

async function ensure_latest() {
  const latest_manifest = await get_latest_manifest();
  const { version, game_files } = latest_manifest;
  const fpath = "./game_files/" + version;
  const is_new = !(await available_versions()).includes(version);
  const target_files = game_files
    .concat(get_runner_files())
    //remove duplicates
    .filter(function (item, pos, self) {
      return self.indexOf(item) == pos;
    });
  //the page can gain scripts without a version bump, and older downloads
  //may predate the scraping, so an existing folder gets topped up too
  const missing = [];
  for (const itm of target_files) {
    if (is_new || !(await file_exists(locate_game_file(itm, version)))) {
      missing.push(itm);
    }
  }
  if (missing.length == 0) {
    console.log(`version ${version} is already downloaded`);
  } else {
    if (is_new) {
      console.log(`downloading version ${version}`);
    } else {
      console.log(
        `version ${version} is missing ${missing.length} files, downloading them`,
      );
    }
    console.debug("downloading files:\n%s", missing);
    try {
      if (is_new) await fs.mkdir(fpath);
      const tasks = missing.map((itm) =>
        download_file(base_url + itm, locate_game_file(itm, version)),
      );
      await Promise.all(tasks);
    } catch (e) {
      //a folder that was already there is still usable, leave it be
      if (is_new) await fs.rmdir(fpath, { recursive: true });
      throw e;
    }
  }
  await fs.writeFile(
    locate_manifest(version),
    JSON.stringify(latest_manifest, null, 2),
  );
  return version;
}
module.exports = {
  cull_versions,
  ensure_latest,
  locate_game_file,
  get_runner_files,
  get_game_files,
};
