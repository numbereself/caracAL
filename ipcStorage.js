function make_IPC_storage(ident) {
  const items = new Map();
  const mock_parent = {
    setItem(_key,_val) {
      const key = String(_key);
      const val = String(_val);
      process.send({
        type:"stor",
        op:"set",
        ident,
        data:{[key]:val}
      });
      return items.set(key,val);
    },
    getItem(_key) {
      const key = String(_key);
      return items.get(key);
    },
    removeItem(_key) {
      const key = String(_key);
      process.send({
        type:"stor",
        op:"del",
        ident,
        data:[key]
      });
      items.delete(key);
    },
    clear() {
      process.send({
        type:"stor",
        op:"clear",
        ident
      });
      items.clear();
    },
    key(n) {
      return Array.from(items.keys())[n];
    },
    get length() {
      return items.size;
    },
  }
  process.on("message", (m) => {
    if(m.type=="stor" && m.ident==ident) {
      if(m.op == "set") {
        for(let key in m.data) {
          items.set(key,m.data[key]);
        }
      }
      if(m.op == "del") {
        for(let key of m.data) {
          items.delete(key);
        }
      }
      if(m.op == "clear") {
        items.clear();
      }
    }
  });
  
  process.send({
    type:"stor",
    op:"init",
    ident
  });
  
  return new Proxy(Object.create(mock_parent), {
    get: function (oTarget, sKey) {
      return mock_parent[sKey] || mock_parent.getItem(sKey) || undefined;
    },
    set: function (oTarget, sKey, vValue) {
      //length cannot be set in this manner
      if(sKey == "length") return vValue;
      return mock_parent.setItem(sKey, vValue);
    },
    deleteProperty: function (oTarget, sKey) {
      //base keys can only be deleted with removeItem
      if (sKey in mock_parent) { return true; }
      return mock_parent.removeItem(sKey);
    },
    //return contents but not base keys
    ownKeys: function (oTarget, sKey) {
      return Array.from(items.keys()).filter(key=>!(key in mock_parent));
    },
    has: function (oTarget, sKey) {
      return (sKey in mock_parent) || items.has(sKey);
    },
    getOwnPropertyDescriptor: function(oTarget, sKey) {
      if (sKey in mock_parent) { return undefined; }
      if (!items.has(sKey)) { return undefined; }
      return { value: mock_parent.getItem(sKey), writable: true, enumerable: true, configurable: true };
    }
  });
}

exports.make_IPC_storage = make_IPC_storage;