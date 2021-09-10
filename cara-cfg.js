'use strict';
var inquirer = require('inquirer');
const fetch = require('node-fetch');
const account_info = require("./account_info");
const fs = require("fs").promises;
const { constants } = require('fs');

async function make_auth(email,password) {
  const raw = await fetch('https://adventure.land/api/signup_or_login', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'arguments={"email":"' + email + '","password":"' + password + '","only_login":true}&method=signup_or_login'
  });
  if(!raw.ok) {
    throw new Error(`failed to call login api: ${raw.statusText}`);
  }
  const msg = (await raw.json()).find(x=>x.message);
  if(!msg) {
    throw new Error(`unexpected login api response`);
  }

  function find_auth(req) {
    let match;
    req.headers.raw()['set-cookie'].find(x=>
    match = /auth=([0-9]+-[a-zA-Z0-9]+)/.exec(x));
    return match[1];
  }
  if(msg.message == "Logged In!") {
    return find_auth(raw);
  }

  return null;
}

async function prompt_chars(all_chars) {
  const enabled_chars = [];
  while (true) {
    const char_question = {
      type: 'list',
      message: `Which characters do you want to run?
Select 'Deploy' when you are done choosing`,
      name: 'chara',
      choices: [{name:`Deploy ${enabled_chars.length} characters`,value:-1}]
        .concat(all_chars.map((x,i)=>({value:i,
          name:enabled_chars.includes(i) && `Disable ${x}` || `Enable ${x}`}))),
      default:1
    };
    const {chara} = await inquirer.prompt([char_question]);
    if(chara == -1) {
      break;
    }
    if(enabled_chars.includes(chara)) {
      enabled_chars.splice(enabled_chars.indexOf(chara), 1);
    } else {
      enabled_chars.push(chara);
    }
  }
  return enabled_chars;
}

async function prompt_new_cfg() {
  let session = null;
  while(!session) {
    console.log("please enter your credentials");
    const {email,password} = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'Email',
      },
      {
        type: 'password',
        message: 'Password',
        name: 'password',
        mask: '*',
      },
    ]);
    session = await make_auth(email,password);
    if(!session) {
      console.warn("email or password seems to be wrong.");
    }
  }
  const my_acc = await account_info(session);
  my_acc.auto_update = false;
  const all_realms = my_acc.response.servers.map(x=>x.key);
  const all_chars = my_acc.response.characters.map(x=>x.name);
  const yesno_choice = [{value:true,name:"Yes"},{value:false,name:"No"}];
  const enabled_chars = await prompt_chars(all_chars);
  if(enabled_chars.length <= 0) {
    console.warn("you did not enable any chars");
    console.log("but you can change that manually in the config file");
  }
  const {realm,use_bwi,use_minimap,port} = 
    await inquirer.prompt([
    {
      type: 'list',
      name: 'realm',
      message: 'Which realm do you want your chars to run in',
      choices: all_realms,
    },{
      type: 'list',
      name: 'use_bwi',
      message: 'Do you want to use the web monitoring panel?',
      choices: yesno_choice,
    },{
      type: 'list',
      name: 'use_minimap',
      message: `Do you also want to enable the minimap?
If you want max performance you should choose no.`,
      choices: yesno_choice,
      when(answers) {
        return answers.use_bwi;
      }
    },{
      type: 'number',
      name: 'port',
      message: 'What port would you like to run the web panel on?',
      when(answers) {
        return answers.use_bwi;
      },
      default: 924
    }
  ]);
  //console.log({realm,use_bwi,use_minimap,port});
  function make_cfg_string() {
    return `
//DO NOT SHARE THIS WITH ANYONE
//the session key can be used to take over your account
//and I would know.(<3 u Nex)
module.exports = {
  //to obtain a session: show_json(parent.user_id+"-"+parent.user_auth)
  //or just delete the config file and restart caracAL
  session:"${session}", 
  //delete all versions except the two latest ones
  cull_versions:true,
  web_app:{
    //enables the monitoring dashboard
    enable_bwi:${use_bwi},
    //enables the minimap in dashboard
    //setting this to true implicitly
    //enables the dashboard
    enable_minimap:${use_minimap || false},
    //exposes the CODE directory
    //useful i.e. if you want to
    //load your code outside of caracAL
    expose_CODE:false,
    port:${port || 924}
  },
  characters:{${all_chars.map((c_name,i) => `
    ${c_name}:{
      realm:"${realm}",
      script:"example.js",
      enabled:${enabled_chars.includes(i)},
      version:0
    },`).join("")}
  }
};
    `;
  }
  await fs.writeFile('./config.js', make_cfg_string());
}



async function interactive() {
  try {
    await fs.access('./config.js', constants.R_OK);
    console.log('config file exists. lets get started!');
  } catch (e){
    console.warn("config file does not exist. lets fix that!");
    console.log("first we need to log you in");
    await prompt_new_cfg();
    console.log("config file created. lets get started!");
    console.log("(you can change any choices you made in config.js)");
  }
}

exports.interactive = interactive;
//interactive();
//prompt_new_cfg();