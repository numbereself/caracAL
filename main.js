const child_process = require("child_process");
const account_info = require("./account_info");
const game_files = require("./game_files");
const log_rotor = require('logrotate-stream');
const log_stream = log_rotor({ file: './caracAL.log', size: 1500000, keep: 3 });
const cara_cfg = require("./cara-cfg");

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
  const version = await game_files.ensure_latest();

  const cfg = require("./config");
  if(cfg.cull_versions) {
    await game_files.cull_versions([version]);
  }
  const sess = process.env.AL_SESSION || cfg.session;
  const my_acc = await account_info(sess);
  const default_realm = my_acc.response.servers[0];

  const character_manage = cfg.characters;

  function update_siblings_and_acc(info) {
    const sib_names = Object.keys(character_manage)
      .filter(x=>character_manage[x].connected).sort();
    
    sib_names.forEach(char=>{
      character_manage[char].instance.send({
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
    
    const args = [g_version,realm.addr,realm.port,sess,char.id, char_block.script];
    const result = child_process.fork("./cara-client.js",args,
      {stdio: ["ignore", "pipe", "pipe", 'ipc']});
    result.stdout.pipe(process.stdout);
    result.stderr.pipe(process.stderr);

    result.on("exit",()=>{
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
          candidate.connected = false;
          candidate.realm = m.realm || char_block.realm;
          candidate.script = m.script || char_block.script;
          candidate.version = m.version || char_block.version;
          if(candidate.instance) {
            candidate.instance.kill();
          } else {
            start_char(new_char_name);
          }
          break;
        case "shutdown":
          char_block.enabled = false;
          result.kill();
          break;
        case "cm":
          let recipients = m.to;
          if(!Array.isArray(recipients)) {
            recipients = [recipients];
          }        
          const [locs,globs] = partition(recipients,
            x=>character_manage[x] && character_manage[x].connected);
          if(globs.length > 0) {
            result.send({
              type:"send_cm",
              to:globs,
              data:m.data
            });
          }
          locs.forEach(blk=>{
            character_manage[blk].instance.send({
              type:"receive_cm",
              name:char_name,
              data:m.data
            });
          });
          break;
      }
    });
    char_block.instance = result;
    return result;
  }
  

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
