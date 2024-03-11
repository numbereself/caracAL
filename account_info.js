const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { console } = require("./src/LogUtils");
class Info {
  constructor() {}

  async updateInfo() {
    console.log("updating account info");
    const raw = await fetch(
      "https://adventure.land/api/servers_and_characters",
      {
        method: "POST",
        headers: {
          Cookie: "auth=" + this.session,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "method=servers_and_characters",
      },
    );
    if (!raw.ok) {
      throw new Error(`failed to update account info: ${raw.statusText}`);
    }
    const res = (await raw.json())[0];
    console.log(
      `found ${res.servers.length} servers and ${res.characters.length} characters`,
    );
    this.listeners.forEach((func) => func(res));
    return (this.response = res);
  }

  add_listener(func) {
    this.listeners.push(func);
  }
  remove_listener(func) {
    const index = this.listeners.indexOf(func);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  static async build(session) {
    const result = new Info();
    result.session = session;
    result.listeners = [];
    result.auto_update = true;
    await result.updateInfo();
    result.task = setInterval(async () => {
      if (result.auto_update) {
        await result
          .updateInfo()
          .catch((e) => console.warn("failed to update account info: %s", e));
      }
    }, 6e3);
    return result;
  }

  destroy() {
    if (this.task) {
      clearInterval(this.task);
    }
  }

  resolve_char(char_name) {
    return this.response.characters.find((char) => char.name == char_name);
  }

  resolve_realm(realm_key) {
    return this.response.servers.find((serv) => serv.key == realm_key);
  }
}
module.exports = Info.build;
