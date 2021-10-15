const { JsonStorage, config } = require('json-storage-fs');
 
(async ()=>{
  

  // (optional set catalog path)
  config({ catalog: './localStorage'});

  JsonStorage.set('name', 'Alice');
  JsonStorage.set('wurg', 'wambo');
  const name = JsonStorage.get('name');
  console.log(name); // -> 'Alice'
})();
