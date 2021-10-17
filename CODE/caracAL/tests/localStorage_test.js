character.on("cm",m=>show_storages());

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function notify_others() {
  const others = parent.X.characters
  .filter(x=>x.name!=character.name).map(x=>x.name);
  send_cm(others,"Check your storage bro!");
}

function show_storages() {
  console.log(`Showing storage data for ${character.name}:`);
  Object.entries(localStorage).forEach(([k,v])=>{
    console.log(`ls: ${k} = ${v}`);
  });
  Object.entries(sessionStorage).forEach(([k,v])=>{
    console.log(`ss: ${k} = ${v}`);
  });
}

show_storages();

localStorage.clear();
sessionStorage.clear();

sessionStorage.setItem(character.name,"Big Flopppa");

for(let key in sessionStorage) {
  console.log(`sessionStorage has key ${key} : ${sessionStorage.getItem(key)}`);
}

notify_others();

(async ()=>{
  await sleep(5000);
  delete sessionStorage[character.name];
  localStorage[character.name+"blorp"] = {};
  localStorage[character.name+"blurp"] = Math.random();
  show_storages();
  notify_others();
})();