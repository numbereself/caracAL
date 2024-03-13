//DO NOT SHARE THIS WITH ANYONE
//the session key can be used to take over your account
//and I would know.(<3 u Nex)
module.exports = {
  //to obtain a session: show_json(parent.user_id+"-"+parent.user_auth)
  //or just delete the config file and restart caracAL
  session: "1111111111111111-abc123ABCabc123ABCabc",
  //delete all versions except the two latest ones
  cull_versions: true,
  //If you want caracAL to compile TypeScript and use the TYPECODE folder
  //This works by running Webpack in the background
  enable_TYPECODE: true,
  //how much logging you want
  //set to "debug" for more logging and "warn" for less logging
  log_level: "info",
  //where to log to
  //the lines are commands which use stdin stream and write it somwehere
  //default is a logrotate file and colorful stdout formatting
  //advanced linuxers: keep in mind that file redirects (>) and pipes (|) are a shell feature
  //so if you wanna use them you have to prefix your command with "bash", "-c"
  log_sinks: [
    [
      "node",
      "./node_modules/logrotate-stream/bin/logrotate-stream",
      "./logs/caracAL.log.jsonl",
      "--keep",
      "3",
      "--size",
      "4500000",
    ],
    ["node", "./standalones/LogPrinter.js"],
  ],
  web_app: {
    //enables the monitoring dashboard
    enable_bwi: false,
    //enables the minimap in dashboard
    //setting this to true implicitly
    //enables the dashboard
    enable_minimap: false,
    //exposes the CODE directory via http
    //this lets you load and debug outside of caracAL
    expose_CODE: false,
    //exposes the TYPECODE.out directory via http
    //this lets you load and debug outside of caracAL
    //useful if you want to dev in regular client
    expose_TYPECODE: false,
    //which port to run webservices on
    port: 924,
  },
  characters: {
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
      typescript: "caracAL/examples/crabs_with_tophats.js",
      enabled: false,
      version: 0,
    },
  },
};
