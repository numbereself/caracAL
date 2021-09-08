//DO NOT SHARE THIS WITH ANYONE
//the session key can be used to take over your account
//and I would know.(<3 u Nex)
module.exports = {
  //to obtain a session: show_json(parent.user_id+"-"+parent.user_auth)
  //or just delete the config file and restart caracAL
  session:"1111111111111111-abc123ABCabc123ABCabc", 
  //delete all versions except the two latest ones
  cull_versions:true,
  web_app:{
    //enables the monitoring dashboard
    enable_bwi:false,
    //exposes the CODE directory
    //useful i.e. if you want to
    //load your code outside of caracAL
    expose_CODE:false,
    port:924
  },
  characters:{
    Wizard:{
      realm:"EUPVP",
      script:"example.js",
      enabled:true,
      version:0
    },
    MERC:{
      realm:"USIII",
      script:"deploy_test.js",
      enabled:true,
      version:"halflife3"
    },
    GG:{
      realm:"ASIAI",
      script:"cm_test.js",
      enabled:false,
      version:0
    },
  }
};