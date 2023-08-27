// This test should be started on your merchant, it will start another non merchant character

console.log(
  `I am ${character.name} from ${
    parent.server_region + parent.server_identifier
  }`
);

const { deploy, shutdown } = parent.caracAL;

// TODO: start another character, wait a little and request for it to shut down
const all_chars = parent.X.characters
  .filter((x) => x.name != character.name)
  .sort((a, b) => (a.name > b.name ? 1 : -1));

setTimeout(() => {
  const second_character = all_chars[0];
  console.log(`deploy ${second_character.name}`)
  deploy(second_character.name, null);

  setTimeout(() => {
    console.log(`shutdown ${second_character.name}`)
    shutdown(second_character.name);
  }, 5000);
}, 5000);