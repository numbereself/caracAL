const child_process = require("child_process");
const account_info = require("./account_info");
const game_files = require("./game_files");
const log_rotor = require('logrotate-stream');
const log_stream = log_rotor({ file: './caracAL.log', size: 1500000, keep: 3 });
const cara_cfg = require("./cara-cfg");
const bwi = require("bot-web-interface");
const monitoring_util = require("./monitoring_util");
const express = require('express');
const json_storage_fs = require('json-storage-fs');
const { constants } = require('fs');
const fs = require('fs').promises;

//TODO check for invalid session
//TODO improve termination
//MAYBE improve linux service
//MAYBE exclude used versions

function partition(a, fun) {
  const ret = [[],[]];
  for (let i = 0; i < a.length; i++)
    if (fun(a[i]))
      ret[0].push(a[i]);
    else
      ret[1].push(a[i]);
  return ret;
}

function patch_writing(strim) {
  const orig = strim.write.bind(strim);
  const alt = log_stream.write.bind(log_stream);
  strim.write = function(chunk, encoding, callback) {
    orig(chunk,encoding,callback);
    alt(chunk,encoding,callback);
  }
}

(async () => {
  await cara_cfg.interactive();
  patch_writing(process.stdout);
  patch_writing(process.stderr);
  
  //json-storage-fs ocasionally creates empty files
  //and afterwards complains that they are not json
  //we provide workaround.
  const json_storage_path = "./localStorage/storage.json";
  try {
    const stor_size = (await fs.stat(json_storage_path)).size;
    //if the file is empty we delete it
    //later we initialize it with {}
    if(stor_size == 0) {
      console.log("storage.json is empty. we will regenerate it");
      await fs.unlink(json_storage_path);
    }
  } catch (e){
    //file probably doesnt exist yet, we create it
  }
  try {
    //check if file exists
    await fs.access(json_storage_path, constants.R_OK);
  } catch (e){
    //probably doesnt exist.
    //write initial storage.json
    await fs.writeFile(json_storage_path,"{}");
  }
  json_storage_fs.config({ catalog: './localStorage'});
  const localStorage = json_storage_fs.JsonStorage;

  const sessionStorage = new Map();
  localStorage.set('caracAL', 'Yeah');
  sessionStorage.set('caracAL', 'Yup');

  const version = await game_files.ensure_latest();

  const cfg = require("./config");
  if(cfg.cull_versions) {
    await game_files.cull_versions([version]);
  }
  const sess = process.env.AL_SESSION || cfg.session;
  const my_acc = await account_info(sess);
  const default_realm = my_acc.response.servers[0];

  const character_manage = cfg.characters;

  //TODO right now this server wont terminate.
  //this is fine atm because caracAL does not terminate when all chars stop.
  //when I change this in the future this might change as well.
  let bwi_instance = {};
  try {
    if(cfg.web_app && 
      (cfg.web_app.enable_bwi || cfg.web_app.enable_minimap)) {
      bwi_instance = new bwi({
        port: cfg.web_app.port,
        password: null
      });
    }
    let express_inst = bwi_instance.router;
    if(cfg.web_app && cfg.web_app.expose_CODE) {
      if(!express_inst) {
        express_inst = express();
        express_inst.listen(cfg.web_app.port);
      }
      express_inst.use('/CODE', express.static(__dirname+'/CODE'));
    }
  } catch (e) {
    console.error(`failed to start web services.`,e);
    console.error(`no web services will be available`);
  }

  function safe_send(target, data) {
    if(target) {
      target.send(data, undefined, undefined, (e) => {
        //This can occur due to node closing ipc
        //before firing its close handlers
        if (e) {
          //console.error(`failed to send ipc`);
          //console.error(`target: `,target);
        }
      });
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  //attempts to softkill child processes
  //by sending an ipc if the client is connected and giving some timeout
  //why not actual SIGTERM? cause windows cant even
  async function softkill_block(char_block) {
    
    const proc = char_block.instance;
    char_block.instance = null;
    if(proc) {
      if(char_block.connected) {
        console.log("telling client to self-terminate");
        safe_send(proc,{
          type:"closing_client"
        });
        const ended_graceful = await Promise.race([
          sleep(500),
          new Promise(resolve => {
            proc.on('exit', function() {
              console.log("Client terminated gracefully");
              resolve(true);
            });
          })
        ]);
        if(ended_graceful) {
          return;
        }
      }
      console.log("Hard-terminating client");
      proc.kill("SIGKILL");
    }
  }

  function update_siblings_and_acc(info) {
    const sib_names = Object.keys(character_manage)
      .filter(x=>character_manage[x].connected).sort();
    
    sib_names.forEach(char=>{
      safe_send(character_manage[char].instance,{
        type:"siblings_and_acc",
        account:info,
        siblings:sib_names
      });
    });
  }

  function start_char(char_name) {
    const char_block = character_manage[char_name];
    let realm = my_acc.resolve_realm(char_block.realm);
    if(!realm) {
      console.warn(`could not find realm ${char_block.realm},`,
        `falling back to realm ${default_realm.key}`);
      char_block.realm = default_realm.key;
      realm = default_realm;
    }
    const char = my_acc.resolve_char(char_name);
    if(!char) {
      console.error(`could not resolve character ${char_name}`,
        `this character will not be started`);
      console.error("are you sure you own this character and have not deleted it?");
      char_block.enabled = false;
      return;
    }
    const g_version = char_block.version || version;
    console.log(`starting ${char_name} running version ${g_version} in ${char_block.realm}`);
    
    const args = [g_version,realm.addr,realm.port,sess,char.id,
       char_block.script, cfg.web_app && cfg.web_app.enable_minimap && "yesmap" || "nomap"];
    const result = child_process.fork("./cara-client.js",args,
      {stdio: ["ignore", "pipe", "pipe", 'ipc']});
    result.stdout.pipe(process.stdout);
    result.stderr.pipe(process.stderr);
    char_block.instance = result;
    result.on("exit",()=>{
      if(char_block.monitor) {
        //close monitor
        char_block.monitor.destroy();
        char_block.monitor = null;
      }
      char_block.connected = false;
      char_block.instance = null;
      if(char_block.enabled) {
        start_char(char_name);
      }
    });
    result.on("message", (m) => {
      switch (m.type) {
        case "initialized":
          break
        case "connected":
          char_block.connected = true;
          update_siblings_and_acc(my_acc.response);
          break
        case "deploy":
          //check for existing charblock, adjust parameters and kill it
          //or not find any, make a new one and start it
          const new_char_name = m.character || char_name;
          const candidate = character_manage[new_char_name] || {};
          character_manage[new_char_name] = candidate;
          candidate.enabled = true;
          candidate.realm = m.realm || char_block.realm;
          candidate.script = m.script || char_block.script;
          candidate.version = m.version || char_block.version;
          if(candidate.instance) {
            
            softkill_block(candidate);
            candidate.connected = false;//TODO i need to refractor lifecycle management
          } else {
            candidate.connected = false;
            start_char(new_char_name);
          }
          break;
        case "shutdown":
          console.log("shutdown requested from " + char_name)
          char_block.enabled = false;
          softkill_block(char_block);
          break;
        case "cm":
          let recipients = m.to;
          if(!Array.isArray(recipients)) {
            recipients = [recipients];
          }        
          const [locs,globs] = partition(recipients,
            x=>character_manage[x] && character_manage[x].connected);
          if(globs.length > 0) {
            safe_send(char_block.instance,{
              type:"send_cm",
              to:globs,
              data:m.data
            });
          }
          locs.forEach(blk=>{
            safe_send(character_manage[blk].instance,{
              type:"receive_cm",
              name:char_name,
              data:m.data
            });
          });
          break;
        //localStorage and sessionStorage related
        case "stor":
          const trg_store = m.ident == "ls"
            ? localStorage
            : sessionStorage;
          switch(m.op) {
            case "set":
              for(let key in m.data) {
                trg_store.set(key,m.data[key]);
              }
              break;
            case "del":
              for(let key of m.data) {
                trg_store.delete(key);
              }
              break;
            case "clear":
              if(m.ident == "ls") {
                localStorage.clearAll();
              } else {
                sessionStorage.clear();
              }
              break;
            case "init":
              const catchup_data={};
              if(m.ident == "ls") {
                localStorage.getAllKeys().forEach(
                  key=>catchup_data[key] = localStorage.get(key));
              } else {
                sessionStorage.forEach(
                  (value, key)=>catchup_data[key]=value);
              }
              safe_send(char_block.instance,{
                type:"stor",
                op:"set",
                ident:m.ident,
                data:catchup_data
              });
              break;
            default:
              break;
          }
          if(m.op != "init") {
            //forward to other running processes
            Object.values(character_manage)
              .filter(x=>x.instance)
              .forEach(block=>{
                safe_send(block.instance,m);
              });
          }
          break;
        default:
          break;
      }
    });
    if(bwi_instance.publisher) {
      char_block.monitor = monitoring_util.create_monitor_ui(bwi_instance,char_name,char_block,cfg.web_app.enable_minimap);
    }
    
    return result;
  }
  //TODO beta new logic for #5
  //i need to implement decent lifecycle-handling
  ['SIGINT', 'SIGTERM', 'SIGQUIT']
  .forEach(signal => process.on(signal, async () => {
    console.log(`Received ${signal} on master. Rounding up clients`);
    //softkill all chars, giving them chance to shutdown
    await Promise.all(Object.values(character_manage).map(
            char_block => {char_block.enabled = false; return softkill_block(char_block)}));
    console.log("now truly exiting");
    process.exit();
  }));
  
  const tasks = Object.keys(character_manage).forEach(c_name=>{
    const char = character_manage[c_name];
    char.connected = false;
    if(char.enabled) {
      start_char(c_name);
    }
  });
  my_acc.add_listener(update_siblings_and_acc);
})().catch(e => {
  console.error("failed to start caracAL", e);
});
