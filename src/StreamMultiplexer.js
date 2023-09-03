//so much pain just because windows doesnt have bash ;-;
const { fork, spawn } = require("node:child_process");
const { pipeline } = require("node:stream");
const cloneable = require('cloneable-readable');

function spawn_sink(command, ...args) {
  if(command === "node") {
    return fork(args[0],args.slice(1),
      {stdio: ["pipe", "inherit", "inherit", "ipc"]});
  } else {
    console.log(command);
    return spawn(command,args,
      {stdio: ["pipe", "inherit", "inherit", "ipc"]});
  }
}

function setup_log_pipes(log_sinks, module_path, ...args) {
  const log_sink_processes = log_sinks.map(command=>spawn_sink(...command));

  const runner = fork(module_path,args,
    {stdio: ["inherit", "pipe", "pipe", "ipc"]});
  const stdout_clone = cloneable(runner.stdout);
  const stderr_clone = cloneable(runner.stderr);

  if(log_sink_processes.length > 0) {
    for(let i = 1; i < log_sink_processes.length; i++) {
      pipeline(stdout_clone.clone(), log_sink_processes[i].stdin
        ,err=>{if(err) throw err;});

      pipeline(stderr_clone.clone(), log_sink_processes[i].stdin
          ,err=>{if(err) throw err;});
    }
    pipeline(stdout_clone, log_sink_processes[0].stdin
        ,err=>{if(err) throw err;});

    pipeline(stderr_clone, log_sink_processes[0].stdin
        ,err=>{if(err) throw err;});
  } else {
    pipeline(stdout_clone, process.stdout
      ,err=>{if(err) throw err;});
    
    pipeline(stderr_clone, process.stderr
      ,err=>{if(err) throw err;});
  }
}

module.exports = {setup_log_pipes};
