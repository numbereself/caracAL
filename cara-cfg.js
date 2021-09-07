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
  const realm_question = {
    type: 'list',
    name: 'realm',
    message: 'Which realm do you want your chars to run in',
    choices: all_realms,
  };
  const char_question = {
    type: 'checkbox',
    message: 'Which characters do you want to run',
    name: 'chars',
    choices: all_chars,
  };
  const web_question = {
    type: 'list',
    name: 'use_bwi',
    message: 'Do you want to use the web monitoring panel?',
    choices: ["Yes","No"],
  };
  const {realm,chars,use_bwi} = 
    await inquirer.prompt([realm_question,char_question,web_question]);
  
  let port = 924;
  if(use_bwi == "Yes") {
    port = (await inquirer.prompt([{
      type: 'number',
      name: 'port',
      message: 'What port would you like to run the web panel on? (Default 924)',
      default: 924
    }])).port;
  }


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
    enable_bwi:${use_bwi=='Yes'},
    //exposes the CODE directory
    //useful i.e. if you want to
    //load your code outside of caracAL
    expose_CODE:false,
    port:${port}
  },
  characters:{${all_chars.map(c_name => `
    ${c_name}:{
      realm:"${realm}",
      script:"example.js",
      enabled:${chars.includes(c_name)},
      version:0
    },`).join("")}
  }
};
    `;
  }
  await fs.writeFile('./config.js', make_cfg_string());
  return [chars];
}

async function interactive() {
  try {
    await fs.access('./config.js', constants.R_OK);
    console.log('config file exists. lets get started!');
  } catch (e){
    console.warn("config file does not exist. lets fix that!");
    console.log("first we need to log you in");
    const [enabled_chars] = await prompt_new_cfg();
    if(enabled_chars.length <= 0) {
      console.warn("you did not enable any chars");
      console.log("but you can change that manually in the config file");
    }
    console.log("config file created. lets get started!");
    console.log("(you can change any choices you made in config.js)");
  }
}

exports.interactive = interactive;
//interactive();
//prompt_new_cfg();