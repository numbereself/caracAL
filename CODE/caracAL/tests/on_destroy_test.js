const { deploy } = parent.caracAL;

//relog to asia after delay
setTimeout(() => deploy(), 37e3);

function on_destroy() {
  // called just before the CODE is destroyed
  console.log("%s was absolutely demolished", character.name);
}
