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

//the node context provides its own jquery/io/bowser
const SKIPPED_SCRIPT_PATTERNS = [
  /^\/js\/socket\.io\//,
  /^\/js\/jquery\//,
  /^\/js\/libraries\/(jquery|bowser)/,
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
    const src = match[1].split("?")[0];
    if (
      !src.startsWith("/") ||
      SKIPPED_SCRIPT_PATTERNS.some((x) => x.test(src))
    ) {
      continue;
    }
    if (!result.includes(src)) result.push(src);
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
  const only_digits = /^\d+$/;
  return (await fs.readdir("./game_files", { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((version) => only_digits.test(version))
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
  //match the runtime flags in html_vars.js
  const response = await fetch(
    base_url + "/?is_bot=1&no_graphics=1&no_html=bot",
  );
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
  const version_directory = "./game_files/" + version;
  const is_new_version = !(await available_versions()).includes(version);

  const combined_script_paths = game_files.concat(get_runner_files());
  const unique_script_paths = [...new Set(combined_script_paths)];

  //game files are stored flat, see locate_game_file
  const script_basenames = unique_script_paths.map((script_path) =>
    posix_path.basename(script_path),
  );
  const conflicting_basename = script_basenames.find(
    (basename, index) => script_basenames.indexOf(basename) != index,
  );
  if (conflicting_basename) {
    throw new Error(`game files share the file name ${conflicting_basename}`);
  }

  //the page can gain scripts without a version bump, and older downloads
  //may predate the scraping, so an existing folder gets topped up too
  const missing_script_paths = [];
  for (const script_path of unique_script_paths) {
    if (
      is_new_version ||
      !(await file_exists(locate_game_file(script_path, version)))
    ) {
      missing_script_paths.push(script_path);
    }
  }
  if (missing_script_paths.length == 0) {
    console.log(`version ${version} is already downloaded`);
  } else {
    if (is_new_version) {
      console.log(`downloading version ${version}`);
    } else {
      console.log(
        `version ${version} is missing ${missing_script_paths.length} files, downloading them`,
      );
    }
    console.debug("downloading files:\n%s", missing_script_paths);
    try {
      if (is_new_version) await fs.mkdir(version_directory);
      const download_tasks = missing_script_paths.map((script_path) =>
        download_file(
          base_url + script_path,
          locate_game_file(script_path, version),
        ),
      );
      await Promise.all(download_tasks);
    } catch (e) {
      //a folder that was already there is still usable, leave it be
      if (is_new_version)
        await fs.rmdir(version_directory, { recursive: true });
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
