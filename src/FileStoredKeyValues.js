const fs = require("node:fs");
const { entries } = Object;
//TODO skip unchanged keys on client layer directly
class FileStoredKeyValues {
  #main_path;
  #replacer_path;
  #backend;
  #handle;
  #compactionTimer;

  constructor(
    main_path = "garage.jsonl",
    replacer_path = "garage.new.jsonl",
    compaction_interval = 30e3,
  ) {
    if (main_path === replacer_path) {
      throw new Error(
        `Please choose different main path and replacer path: ${main_path}`,
      );
    }
    this.#main_path = main_path;
    this.#replacer_path = replacer_path;
    this.#backend = new Map();
    this.#initializeHandle();
    this.#compactionTimer = setInterval(
      () => this.compact(),
      compaction_interval,
    );
    this.compact();
  }

  #checkFileExistence(path) {
    let handle = null;
    try {
      handle = fs.openSync(path, "r");
    } catch (err) {
      return false;
    } finally {
      if (handle !== null) {
        fs.closeSync(handle);
      }
    }
    return true;
  }

  #initializeHandle() {
    if (
      this.#checkFileExistence(this.#replacer_path) &&
      !this.#checkFileExistence(this.#main_path)
    ) {
      fs.renameSync(this.#replacer_path, this.#main_path);
    }
    this.#handle = fs.openSync(this.#main_path, "a+");
    const handle_contents = fs.readFileSync(this.#handle, "utf8").split("\n");
    for (let line of handle_contents) {
      const trimmed_line = line.trim();
      if (trimmed_line.length === 0) continue;
      try {
        const [key, value] = entries(JSON.parse(trimmed_line))[0];
        if (value === null) {
          this.#backend.delete(key);
        } else {
          this.#backend.set(key, value);
        }
      } catch (err) {
        console.error(
          `FileStoredKeyValues: skipping corrupt line (${
            err.message
          }): ${trimmed_line.slice(0, 120)}`,
        );
      }
    }
  }

  compact() {
    // Write and sync a replacement before renaming it over the original.
    // Keep the original handle usable if preparing or renaming fails.
    const k_v_list = [];
    for (let [key, value] of this.#backend.entries()) {
      k_v_list.push(JSON.stringify({ [key]: value }) + "\n");
    }
    const fd = fs.openSync(
      this.#replacer_path,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_TRUNC |
        fs.constants.O_APPEND,
    );
    try {
      fs.writeFileSync(fd, k_v_list.join(""), { encoding: "utf8" });
      fs.fsyncSync(fd);
      fs.renameSync(this.#replacer_path, this.#main_path);
    } catch (err) {
      fs.closeSync(fd);
      throw err;
    }
    const old_handle = this.#handle;
    this.#handle = fd;
    fs.closeSync(old_handle);
  }

  close() {
    clearInterval(this.#compactionTimer);
    fs.fsyncSync(this.#handle);
    fs.closeSync(this.#handle);
  }

  //i dont guarantee functionality if you set values that are not strings
  set(key, value) {
    if (this.get(key) !== value) {
      fs.writeFileSync(this.#handle, JSON.stringify({ [key]: value }) + "\n", {
        encoding: "utf8",
      });
      this.#backend.set(key, value);
    }
    return this;
  }

  delete(key) {
    fs.writeFileSync(this.#handle, JSON.stringify({ [key]: null }) + "\n", {
      encoding: "utf8",
    });
    return this.#backend.delete(key);
  }

  get(key) {
    return this.#backend.get(key);
  }

  entries() {
    return this.#backend.entries();
  }
}

module.exports = FileStoredKeyValues;
