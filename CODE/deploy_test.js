//start this test on one char in EU

console.log(`I am ${character.name} from ${parent.server_region + parent.server_identifier}`);
const {deploy,shutdown} = parent.caracAL;
if(parent.server_region != "ASIA") {
  //relog to asia after delay
  setTimeout(()=>deploy(null,"ASIAI"),37e3);
} else {
  //log out after delay
  setTimeout(()=>shutdown(),33e3);
}


setTimeout(()=>{
  console.log(`${character.name}: My siblings are ${parent.caracAL.siblings}`);
},10e3);

//deliberating bringing in lodash
//tho i dont even know what that is.
function partition(a, fun) {
  const ret = [[],[]];
  for (let i = 0; i < a.length; i++)
    if (fun(a[i]))
      ret[0].push(a[i]);
    else
      ret[1].push(a[i]);
  return ret;
}

setTimeout(()=>{
  const all_chars = parent.X.characters
    .filter(x=>x.type!="merchant")
    .sort((a,b)=>a.name > b.name ? 1 : -1)
  const [onliners,offliners] = partition(all_chars, x=>x.server 
    || parent.caracAL.siblings.includes(x.name));
  if(onliners.length < 3) {
    //deploy a char after delay
    const to_deploy = offliners[0].name;
    console.log(`${character.name} is starting ${to_deploy}`);
    deploy(to_deploy,"EUI");
  }
},23e3);


