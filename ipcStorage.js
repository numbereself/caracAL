function makeIPCStorage(ident) {
  const store = {};
  const bonus = {
    setItem(key,val) {
      process.send({
        type:"stor_set",
        ident,
        data:{[key]:val}
      });
      return store[key] = String(val);
    },
    getItem(key) {
      if(bonus[key] || key=="length") {
        return null;
      }
      return store[key];
    },
    removeItem(key) {
      return delete store[key];
    },
    clear() {
      for(let key in store) {
        delete store[key];
      }
    }
  }
  for(let k in bonus) {
    Object.defineProperty(store,k,{value:bonus[k]});
  }
  Object.defineProperty(store,"length",{get:()=>count});
  process.on("message", (m) => {
    if(m.type=="stor_get" && m.ident==ident) {
      for(let key in m.data) {
        bonus.setItem(key,m.data[key]);
      }
    }
  });
  process.send({
    type:"stor_init",
    ident
  });

  return new Proxy(store, {
    set(obj, key, val) {
      return obj.setItem(key,val);
    }
  });
}

exports.makeIPCStorage = makeIPCStorage;