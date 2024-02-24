"use strict";
var inquirer = require("inquirer");
const fetch = require("node-fetch");
const account_info = require("../account_info");
const fs = require("fs").promises;
const { constants } = require("fs");

async function make_auth(base_url, email, password) {
  const raw = await fetch(`${base_url}/api/signup_or_login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      'arguments={"email":"' +
      encodeURIComponent(email) +
      '","password":"' +
      encodeURIComponent(password) +
      '","only_login":true}&method=signup_or_login',
  });
  if (!raw.ok) {
    throw new Error(`failed to call login api: ${raw.statusText}`);
  }
  const msg = (await raw.json()).find((x) => x.message);
  if (!msg) {
    throw new Error(`unexpected login api response`);
  }

  function find_auth(req) {
    let match;
    req.headers
      .raw()
      ["set-cookie"].find(
        (x) => (match = /auth=([0-9]+-[a-zA-Z0-9]+)/.exec(x)),
      );
    return match[1];
  }
  if (msg.message == "Logged In!") {
    return find_auth(raw);
  }

  return null;
}

async function prompt_server() {
  const yesno_choice = [
    { value: true, name: "Yes" },
    { value: false, name: "No" },
  ];

  const { use_official_server, server_url } = await inquirer.prompt([
    {
      type: "list",
      name: "use_official_server",
      message: `Are you playing on the official adventure.land servers?`,
      choices: yesno_choice,
    },
    {
      type: "input",
      name: "server_url",
      message:
        "Type in the url of the server, for example http://localhost:8083",
      when(answers) {
        return !answers.use_official_server;
      },
    },
    // TODO: can we validate for a correcct url?
    // {
    //   type: "number",
    //   name: "port",
    //   message: "What port would you like to run the web panel on?",
    //   when(answers) {
    //     return answers.use_bwi;
    //   },
    //   default: 924,
    // },
  ]);

  if (use_official_server) {
    return "https://adventure.land";
  } else {
    return server_url;
  }
}

async function prompt_chars(all_chars) {
  const enabled_chars = [];
  while (true) {
    const char_question = {
      type: "list",
      message: `Which characters do you want to run?
Select 'Deploy' when you are done choosing`,
      name: "chara",
      choices: [
        { name: `Deploy ${enabled_chars.length} characters`, value: -1 },
      ].concat(
        all_chars.map((x, i) => ({
          value: i,
          name: (enabled_chars.includes(i) && `Disable ${x}`) || `Enable ${x}`,
        })),
      ),
      default: 1,
    };
    const { chara } = await inquirer.prompt([char_question]);
    if (chara == -1) {
      break;
    }
    if (enabled_chars.includes(chara)) {
      enabled_chars.splice(enabled_chars.indexOf(chara), 1);
    } else {
      enabled_chars.push(chara);
    }
  }
  return enabled_chars;
}

async function prompt_new_cfg(base_url) {
  let session = null;
  while (!session) {
    console.log("please enter your credentials");
    const { email, password } = await inquirer.prompt([
      {
        type: "input",
        name: "email",
        message: "Email",
      },
      {
        type: "password",
        message: "Password",
        name: "password",
        mask: "*",
      },
    ]);
    session = await make_auth(base_url, email, password);
    if (!session) {
      console.warn("email or password seems to be wrong.");
    }
  }
  const my_acc = await account_info(base_url, session);
  my_acc.auto_update = false;
  const all_realms = my_acc.response.servers.map((x) => x.key);
  const all_chars = my_acc.response.characters.map((x) => x.name);
  my_acc.destroy();
  const yesno_choice = [
    { value: true, name: "Yes" },
    { value: false, name: "No" },
  ];
  const enabled_chars = await prompt_chars(all_chars);
  if (enabled_chars.length <= 0) {
    console.warn("you did not enable any chars");
    console.log("but you can change that manually in the config file");
  }
  const { realm, use_bwi, use_minimap, port } = await inquirer.prompt([
    {
      type: "list",
      name: "realm",
      message: "Which realm do you want your chars to run in",
      choices: all_realms,
    },
    {
      type: "list",
      name: "use_bwi",
      message: "Do you want to use the web monitoring panel?",
      choices: yesno_choice,
    },
    {
      type: "list",
      name: "use_minimap",
      message: `Do you also want to enable the minimap?
If you want max performance you should choose no.`,
      choices: yesno_choice,
      when(answers) {
        return answers.use_bwi;
      },
    },
    {
      type: "number",
      name: "port",
      message: "What port would you like to run the web panel on?",
      when(answers) {
        return answers.use_bwi;
      },
      default: 924,
    },
  ]);
  //console.log({realm,use_bwi,use_minimap,port});

  const conf_object = {
    BASE_URL: base_url,
    session: session,
    cull_versions: true,
    log_level: "info",
    log_sinks: [
      [
        "node",
        "./node_modules/logrotate-stream/bin/logrotate-stream",
        "./logs/caracAL.log.jsonl",
        "--keep",
        "3",
        "--size",
        "1500000",
      ],
      ["node", "./standalones/LogPrinter.js"],
    ],
    web_app: {
      enable_bwi: use_bwi,
      enable_minimap: use_minimap || false,
      expose_CODE: false,
      port: port || 924,
    },
    characters: all_chars.reduce((acc, c_name, i) => {
      acc[c_name] = {
        realm: realm,
        script: "caracAL/examples/crabs.js",
        enabled: enabled_chars.includes(i),
        version: 0,
      };
      return acc;
    }, {}),
  };

  await fs.writeFile(CARACAL_CONFIG_PATH, make_cfg_string(conf_object));
}

const fallback = (first, second) =>
  JSON.stringify(first !== undefined ? first : second, null, 2);

function make_cfg_string(conf_object = {}) {
  const ezpz = (key, substitute) =>
    `${key.split(".").pop()}:${fallback(
      key
        .split(".")
        .reduce(
          (prev, curr) => (prev == undefined ? undefined : prev[curr]),
          conf_object,
        ),
      substitute,
    )}`;
  const characters = conf_object.characters || {
    Wizard: {
      realm: "EUPVP",
      script: "caracAL/examples/crabs.js",
      enabled: true,
      version: 0,
    },
    MERC: {
      realm: "USIII",
      script: "caracAL/tests/deploy_test.js",
      enabled: true,
      version: "halflife3",
    },
    GG: {
      realm: "ASIAI",
      script: "caracAL/tests/cm_test.js",
      enabled: false,
      version: 0,
    },
  };
  return `//DO NOT SHARE THIS WITH ANYONE
//the session key can be used to take over your account
//and I would know.(<3 u Nex)
module.exports = {
  //to obtain a session: show_json(parent.user_id+"-"+parent.user_auth)
  //or just delete the config file and restart caracAL
  ${ezpz("BASE_URL", "https://adventure.land")},
  ${ezpz("session", "1111111111111111-abc123ABCabc123ABCabc")}, 
  //delete all versions except the two latest ones
  ${ezpz("cull_versions", true)},
  //how much logging you want
  //set to "debug" for more logging and "warn" for less logging
  ${ezpz("log_level", "info")},
  //where to log to
  //the lines are commands which use stdin stream and write it somwehere
  //default is a logrotate file and colorful stdout formatting
  //advanced linuxers: keep in mind that file redirects (>) and pipes (|) are a shell feature
  //so if you wanna use them you have to prefix your command with "bash", "-c"
  ${ezpz("log_sinks", [
    [
      "node",
      "./node_modules/logrotate-stream/bin/logrotate-stream",
      "./logs/caracAL.log.jsonl",
      "--keep",
      "3",
      "--size",
      "1500000",
    ],
    ["node", "./standalones/LogPrinter.js"],
  ])},
  web_app:{
    //enables the monitoring dashboard
    ${ezpz("web_app.enable_bwi", false)},
    //enables the minimap in dashboard
    //setting this to true implicitly
    //enables the dashboard
    ${ezpz("web_app.enable_minimap", false)},
    //exposes the CODE directory
    //useful i.e. if you want to
    //load your code outside of caracAL
    ${ezpz("web_app.expose_CODE", false)},
    //which port to run webservices on
    ${ezpz("web_app.port", 924)}
  },
  characters:{
${Object.entries(characters)
  .map(
    ([cname, cconf]) => `    ${JSON.stringify(cname)}:{
      realm:${fallback(cconf.realm, "EUI")},
      script:${fallback(cconf.script, "caracAL/examples/crabs.js")},
      enabled:${fallback(cconf.enabled, false)},
      version:${fallback(cconf.version, 0)}
    }`,
  )
  .join(",\n")}
  }
};
`;
}

let CARACAL_CONFIG_PATH = "./config.js";
async function interactive(configPath) {
  CARACAL_CONFIG_PATH = configPath;

  try {
    await fs.access(CARACAL_CONFIG_PATH, constants.R_OK);
    console.log("config file exists. lets get started!");
  } catch (e) {
    console.warn("config file does not exist. lets fix that!");
    console.log("first we need to log you in");
    // promt official server? or community server?
    const server_base_url = await prompt_server();
    await prompt_new_cfg(server_base_url);
    console.log("config file created. lets get started!");
    console.log("(you can change any choices you made in config.js)");
  }
}

module.exports = {
  interactive,
  prompt_new_cfg,
  make_cfg_string,
};
