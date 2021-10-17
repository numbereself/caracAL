console.log("begin script load test");
parent.caracAL.load_scripts(["tests/script_load_test__.js"])
  .then(x=>console.log("loaded script ",globalThis.carac_message));