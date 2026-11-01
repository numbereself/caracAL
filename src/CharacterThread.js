const vm = require("vm");
const io = require("socket.io-client");
const fs = require("fs").promises;
const { JSDOM } = require("jsdom");
const node_query = require("jquery");
const game_files = require("../game_files");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const monitoring_util = require("../monitoring_util");
const ipc_storage = require("../ipcStorage");

const LogUtils = require("./LogUtils");
const { console } = LogUtils;

process.on("unhandledRejection", function (exception) {
  console.warn("promise rejected: \n", exception);
});

const html_spoof = `<!DOCTYPE html>
<html>
<head>
<title>Adventure Land</title>
</head>
<body>
</body>
</html>`;

function make_context(upper = null) {
  const result = new JSDOM(html_spoof, { url: "https://adventure.land/" })
    .window;
  //jsdom maked globalThis point to Node global
  //but we want it to be window instead
  result.globalThis = result;
  result.fetch = fetch;
  result.$ = result.jQuery = node_query(result);
  result.require = require;
  result.console = console;
  if (upper) {
    Object.defineProperty(result, "parent", { value: upper });
    result._localStorage = upper._localStorage;
    result._sessionStorage = upper._sessionStorage;
  } else {
    result._localStorage = ipc_storage.make_IPC_storage("ls");
    result._sessionStorage = ipc_storage.make_IPC_storage("ss");
  }
  vm.createContext(result);

  result.eval = function (arg) {
    return vm.runInContext(arg, result);
  };

  return result;
}

async function ev_files(locations, context) {
  for (let location of locations) {
    let text = await fs.readFile(location, "utf8");
    vm.runInContext(text + "\n//# sourceURL=file://" + location, context);
  }
}

//When an entity's skin changes, adopt_soft_properties() reassigns element.skin
//but skips the new_sprite(element,"full","renew") that generates textures for
//it under no_graphics, so the next draw() -> update_sprite() -> set_texture()
//reads textures[skin][i][j] off undefined. That throw lands before draw()
//reschedules itself, so the loop only comes back through the 250ms watchdog -
//and then throws again on every pass. Renew the sprite ourselves instead.
function patch_no_graphics_skin_change(context) {
  vm.runInContext(
    `
    (function () {
      const original = adopt_soft_properties;
      adopt_soft_properties = function (element, data) {
        const previous = element.skin;
        original(element, data);
        //only the branch guarded on stype "full" can reassign skin
        if (element.stype != "full" || element.skin == previous) return;
        if (textures[element.skin]) return;
        try {
          //the same sanitizing the graphics path does before it renews
          if (!XYWH[element.skin]) element.skin = "naked";
          //no restore_dimensions() - no_graphics textures carry no dimensions
          new_sprite(element, "full", "renew");
        } catch (exception) {
          console.warn(
            "failed to generate textures for skin " + element.skin,
            exception,
          );
        }
      };
    })();
    `,
    context,
  );
}

//a throw from game code that Node calls into would kill the process, where a
//browser only logs it (e.g. 18285's "ui" handler reading character before "start")
function run_game_code(description, fn) {
  try {
    return fn();
  } catch (exception) {
    console.error(`${description} threw`, exception);
  }
}

function make_handler_safe_io(io) {
  return Object.assign(function (...args) {
    const socket = io(...args);
    const emit_event = socket.emitEvent;
    socket.emitEvent = function (event_args) {
      return run_game_code(`game "${event_args[0]}" handler`, () =>
        emit_event.call(this, event_args),
      );
    };
    return socket;
  }, io);
}

//the coordinator lets one character per account log in at a time
function await_login_turn() {
  return new Promise((resolve) => {
    const on_message = (m) => {
      if (m.type == "login_turn_grant") {
        process.off("message", on_message);
        resolve();
      }
    };
    process.on("message", on_message);
    process.send({ type: "login_turn_request" });
  });
}

function release_login_turn() {
  process.send({ type: "login_turn_release" });
}

async function make_runner(upper, CODE_file, version, is_typescript) {
  const runner_sources = game_files
    .get_runner_files()
    .map((f) => game_files.locate_game_file(f, version));
  console.log("constructing runner instance");
  console.debug("source files:\n%s", runner_sources);
  const runner_context = make_context(upper);
  //contents of adventure.land/runner
  //its an html file but not labeled as such
  //TODO in the future i should consider parsing the relevant parts out of the html files directly
  //for the runners as well as the instances
  vm.runInContext(
    `
    var active=false,catch_errors=true,is_code=1,is_server=0,is_game=0,is_bot=parent.is_bot,is_cli=parent.is_cli,is_sdk=parent.is_sdk;
    var Place='game';
    var transporting=false;var Dev=''; 
    var Local='';
    `,
    runner_context,
  );

  // Avoid defining duplicate String methods in the same VM
  vm.runInContext(
    `
  (function() {
    const originalDefine = Object.defineProperty;

    Object.defineProperty = function(obj, prop, descriptor) {
      if (
        obj === String.prototype &&
        prop === "hashCode" &&
        Object.prototype.hasOwnProperty.call(String.prototype, "hashCode")
      ) {
        return obj; // ignore duplicate
      }
      return originalDefine(obj, prop, descriptor);
    };
  })();
`,
    runner_context,
  );
  await ev_files(runner_sources, runner_context);
  runner_context.send_cm = function (to, data) {
    process.send({
      type: "cm",
      to,
      data,
    });
  };
  //we need to do this here because of scoping
  upper.caracAL.load_scripts = async function (locations) {
    if (!is_typescript) {
      return await ev_files(
        locations.map((x) => "./CODE/" + x),
        runner_context,
      );
    } else {
      throw new Exception(
        "Runtime Loading Code is not supported in Typescript Mode.\nUse an import instead",
      );
    }
  };
  vm.runInContext(
    "active = true;parent.code_active = true;set_message('Code Active');if (character.rip) character.trigger('death', {past: true});",
    runner_context,
  );

  process.on("message", (m) => {
    switch (m.type) {
      case "closing_client":
        console.log("terminating self");
        run_game_code("on_destroy", () =>
          vm.runInContext("on_destroy()", runner_context),
        );
        process.exit();
    }
  });

  //so.
  //these should send a shutdown to parent
  //parent deletes instance and marks them inactive
  //if its duplicate then no instance and no double shutdown
  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) =>
    process.on(signal, async () => {
      console.log(`Received ${signal} on client. Requesting termination`);
      process.send({
        type: "shutdown",
      });
    }),
  );

  //awaits the arrival of a message from parent process
  //indicating the servers_and_characters proxy that we use
  const connected_signoff = new Promise((resolve) => {
    process.on("message", (m) => {
      switch (m.type) {
        case "siblings_and_acc":
          resolve();
          break;
      }
    });
  });

  process.send({ type: "connected" });

  console.log("runner instance constructed");
  monitoring_util.register_stat_beat(upper);
  //Fix a bug where parent.X is initially empty
  await connected_signoff;
  await ev_files([CODE_file], runner_context);
  //TODO put a process end handler here

  return runner_context;
}

async function make_game(proc_args) {
  //the game files read html_vars.js as they evaluate, html_init.js calls back
  //into them - hence the order
  const game_sources = ["./html_vars.js"]
    .concat(
      game_files
        .get_game_files(proc_args.version)
        .map((f) => game_files.locate_game_file(f, proc_args.version)),
    )
    .concat(["./html_init.js"]);
  console.log("constructing game instance");
  console.debug("source files:\n%s", game_sources);
  const game_context = make_context();
  game_context.io = make_handler_safe_io(io);
  game_context.bowser = {};
  await ev_files(game_sources, game_context);
  patch_no_graphics_skin_change(game_context);
  game_context.VERSION = "" + game_context.G.version;
  game_context.server_address = "wss://" + proc_args.realm_address;
  game_context.server_path = proc_args.realm_path;
  game_context.server_port = proc_args.realm_port;
  game_context.user_id = proc_args.sess.split("-")[0];
  game_context.user_auth = proc_args.sess.split("-")[1];
  game_context.character_to_load = proc_args.cid;

  //expose the block under parent.caracAL
  const extensions = {};

  extensions.log = LogUtils.log;

  extensions.deploy = function (char_name, realm, script_file, game_version) {
    process.send({
      type: "deploy",
      ...(char_name && { character: char_name }),
      ...(realm && { realm }),
      ...(script_file && { script: script_file }),
      ...(game_version && { version: game_version }),
    });
  };
  extensions.shutdown = function (char_name) {
    process.send({
      type: "shutdown",
      character: char_name,
    });
  };
  extensions.map_enabled = function () {
    return proc_args.enable_map;
  };

  game_context.caracAL = extensions;

  const old_ng_logic = game_context.new_game_logic;
  game_context.new_game_logic = function () {
    old_ng_logic();
    clearTimeout(reload_task);
    release_login_turn();
    //people reported bad performance when switching maps
    //and this allegedly fixes it.
    vm.runInContext("pause()", game_context);

    const is_typescript =
      proc_args.typescript_file && proc_args.typescript_file.length > 0;
    const target_script = is_typescript
      ? "./TYPECODE.out/" + proc_args.typescript_file
      : "./CODE/" + proc_args.script_file;
    (async function () {
      const runner_context = await make_runner(
        game_context,
        target_script,
        proc_args.version,
        is_typescript,
      );
      extensions.runner = runner_context;
    })();
  };
  const old_dc = game_context.disconnect;
  game_context.disconnect = function () {
    old_dc();
    release_login_turn();
    const reason = game_context.disconnect_reason;
    if (
      typeof reason == "string" &&
      reason.startsWith("Too many loose connections")
    ) {
      //some loose sockets may not be ours, e.g. a browser tab
      const delay = 1000 + Math.random() * 2000;
      const seconds = (delay / 1000).toFixed(1);
      console.log(`too many loose connections, redeploying in ${seconds}s`);
      setTimeout(() => extensions.deploy(), delay);
    } else {
      extensions.deploy();
    }
  };
  const old_api = game_context.api_call;
  game_context.api_call = function (method, args, r_args) {
    //servers and characters are handled centrally
    if (method != "servers_and_characters") {
      return old_api(method, args, r_args);
    } else {
      console.debug("filtered s&c call");
    }
  };
  game_context.get_code_function = function (f_name) {
    return (extensions.runner && extensions.runner[f_name]) || function () {};
  };
  //call_code_function("trigger_character_event","cm",{name:data.name,message:JSON.parse(data.message)});

  vm.runInContext(
    `
  (function() {
    const old_add_log = add_log; 
    add_log = function(msg, col) {
      old_add_log(msg,col);
      for(let [msg, col] of game_logs) {
        caracAL.log.info({col:col, type:"game_logs"}, msg);
      }
      game_logs = [];
    }
  })();
  `,
    game_context,
  );
  //show_json causes a popup so it must be important
  //therefore we use warn level here
  vm.runInContext(
    'show_json = function(json) {caracAL.log.warn({data:json, type:"AL", func:"show_json"});}',
    game_context,
  );
  process.send({ type: "initialized" });
  process.on("message", (m) =>
    run_game_code(`"${m.type}" message handler`, () => {
      switch (m.type) {
        case "siblings_and_acc":
          extensions.siblings = m.siblings;
          game_context.handle_information([m.account]);
          break;
        case "receive_cm":
          game_context.call_code_function("trigger_character_event", "cm", {
            name: m.name,
            message: m.data,
            caracAL: true,
          });
          break;
        case "send_cm":
          game_context.send_code_message(m.to, m.data);
          break;
      }
    }),
  );
  //the socket opens in the_game(), everything before still runs in parallel
  await await_login_turn();
  vm.runInContext("the_game()", game_context);
  const reload_timeout = 14;
  const reload_task = setTimeout(
    function () {
      console.warn(
        `game not loaded after ${reload_timeout} seconds, reloading`,
      );
      extensions.deploy();
    },
    reload_timeout * 1000 + 100,
  );
  console.log("game instance constructed");
  return game_context;
}
//have to use on, localstorage may send messages
process.on("message", async (msg) => {
  if (msg.type == "process_args") {
    const { cname, clid } = msg.arguments;
    console.debug(
      "starting character thread with arguments: %O",
      msg.arguments,
    );
    const new_log = LogUtils.log.child({ cname, clid });
    LogUtils.log = new_log;
    await make_game(msg.arguments);
  }
});

process.send({
  type: "process_ready",
});
