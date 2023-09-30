const fs = require("node:fs");
const { entries } = Object;
//TODO skip unchanged keys on client layer directly
class FileStoredKeyValues {
  #main_path;
  #replacer_path;
  #backend;
  #handle;
  #refactorTask;

  constructor(
    main_path = "garage.jsonl",
    replacer_path = "garage.new.jsonl",
    refactor_interval = 30e3,
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
    this.#refactorTask = setInterval(() => this.refactor(), refactor_interval);
    this.refactor();
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
      if (line.length > 0) {
        const [key, value] = entries(JSON.parse(line))[0];
        if (value === null) {
          this.#backend.delete(key);
        } else {
          this.#backend.set(key, value);
        }
      }
    }
  }

  refactor() {
    //this method writes the current contents without history
    //it writes to a temp file then replaces original
    //this guarantees that data will never be lost
    const k_v_list = [];
    for (let [key, value] of this.#backend.entries()) {
      k_v_list.push(JSON.stringify({ [key]: value }) + "\n");
    }
    fs.writeFileSync(this.#replacer_path, k_v_list.join(""), {
      encoding: "utf8",
    });
    fs.closeSync(this.#handle);
    fs.unlinkSync(this.#main_path);
    fs.renameSync(this.#replacer_path, this.#main_path);
    this.#handle = fs.openSync(this.#main_path, "a");
  }

  close() {
    clearInterval(this.#refactorTask);
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
