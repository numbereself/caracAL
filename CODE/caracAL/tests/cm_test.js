character.on("cm", (m) =>
  console.log("Received a cm on character %s: %s", character.name, m),
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function behold_my_spam() {
  await sleep(5000 + 5000 * Math.random());
  const trgs = parent.X.characters.map((x) => x.name);
  send_cm(trgs, `${character.name} sends his regards`);
  await behold_my_spam();
}

behold_my_spam();
