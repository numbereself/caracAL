const prettyMilliseconds = require('pretty-ms');
const stat_beat_interval = 500;

function humanize_int(num, digits) {
  num = Math.round(num);
  const lookup = [
    { value: 1e3, symbol: "" },
    { value: 1e6, symbol: "k" },
    { value: 1e9, symbol: "Mil" },
    { value: 1e12, symbol: "Bil" },
    { value: 1e15, symbol: "Tril" }
  ];
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  var item = lookup.find(function(item) {
    return Math.abs(num) < item.value;
  });
  return item ? (num * 1e3 / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : num.toExponential(digits);
}

function register_stat_beat(g_con) {
  g_con.caracAL.stat_beat = setInterval(()=>{
    const character = g_con.character;
    const result = {type:"stat_beat"};
    ["rip","hp","max_hp","mp","max_mp","level","xp","max_xp","gold","party","isize","esize"]
      .forEach(x=>result[x] = character[x]);
    const targeting = g_con.entities[character.target];
    result.t_mtype = targeting && targeting.mtype || null;
    result.t_name = targeting && targeting.name || null;
    result.current_status = g_con.current_status;
    process.send(result);
  },stat_beat_interval);
}

//g_child is a child process with a stat beat
function create_monitor_ui(bwi,char_name,child_block) {
  let xp_histo = [];
  let xp_ph = 0;
  let gold_histo = [];
  let last_beat = null;
  child_block.instance.on("message", (m) => {
    if(m.type == "stat_beat") {
      gold_histo.push(m.gold);
      gold_histo = gold_histo.slice(-100);
      if(last_beat && last_beat.level != m.level) {
        xp_histo = [];
      }
      xp_histo.push(m.xp);
      xp_histo = xp_histo.slice(-100);
      xp_ph = val_ph(xp_histo);
      last_beat = m;
    }
  });
  function quick_bar_val(num,denom,humanize=false) {
    let modif = x=>x;
    if(humanize) {
      modif = x=>humanize_int(x,1);
    }
    return [100 * num / denom,`${modif(num)}/${modif(denom)}`];
  }
  function val_ph(arr) {
    if(arr.length < 2) {
      return 0;
    }
    return (arr[arr.length-1] - arr[0]) * 3600000 / (arr.length-1) / stat_beat_interval;
  }
  const schema = [
    {name: "name", type: "text", label: "Name", getter:()=>char_name},
    {name: "realm", type: "text", label: "Realm", getter:()=>child_block.realm},
    {name: "not_rip", type: "text", label: "Alive", getter:()=>last_beat.rip && "No" || "Yes"},
    {name: "level", type: "text", label: "Level", getter:()=>last_beat.level},
    {name: "health", type: "labelProgressBar", label: "Health", options: {color: "red"}, 
      getter:()=>quick_bar_val(last_beat.hp,last_beat.max_hp)},
    {name: "mana", type: "labelProgressBar", label: "Mana", options: {color: "blue"},
      getter:()=>quick_bar_val(last_beat.mp,last_beat.max_mp)},
    {name: "xp", type: "labelProgressBar", label: "XP", options: {color: "green"}, 
      getter:()=>quick_bar_val(last_beat.xp,last_beat.max_xp,true)},
    {name: "inv", type: "labelProgressBar", label: "Inventory", options: {color: "brown"}, 
      getter:()=>quick_bar_val(last_beat.isize - last_beat.esize,last_beat.isize)},
    {name: "gold", type: "text", label: "Gold", getter:()=>humanize_int(last_beat.gold,1)},
    {name: "party_leader", type: "text", label: "Party Leader", getter:()=>last_beat.party},
    {name: "current_status", type: "text", label: "Status", getter:()=>last_beat.current_status},
    {name: "target", type: "text", label: "Target",
      getter:()=>last_beat.t_name && (last_beat.mtype && "" || "Player ")+last_beat.t_name || "None"},
    {name: "gph", type: "text", label: "Gold/h", getter:()=>humanize_int(val_ph(gold_histo),1)},
    {name: "xpph", type: "text", label: "XP/h", getter:()=>humanize_int(xp_ph,1)},
    {name: "ttlu", type: "text", label: "TTLU", 
      getter:()=>xp_ph <= 0 && "N/A" || prettyMilliseconds((last_beat.max_xp-last_beat.xp)*3600000/xp_ph,{unitCount: 2})}
  ];
  const ui = bwi.publisher.createInterface(schema.map(x=>({
    name:x.name,
    type:x.type,
    label:x.label,
    options:x.options
  })));
  ui.setDataSource(() => {
    if(!last_beat) {
      return {
        name:char_name,
        realm:child_block.realm,
        not_rip:"Hopefully",
        current_status:"Loading..."
      };
    }
    const result = {};
    schema.forEach(x=>result[x.name] = x.getter());
    return result;
  });
  return ui;
}

exports.create_monitor_ui = create_monitor_ui;
exports.register_stat_beat = register_stat_beat;