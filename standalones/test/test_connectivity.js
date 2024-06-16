const io = require("socket.io-client");

(async () => {
  const socket = io("wss://" + "eud1.adventure.land" + ":" + 2053, {
    secure: true,
    transports: ["websocket"],
    query: undefined,
  });

  // this ws connection works...
  // const socket = io("ws://" + "localhost" + ":" + 8022, {
  //   secure: false,
  //   transports: ["websocket"],
  //   query: undefined,
  // });

  socket.on("connect", function () {
    console.log("connected");
  });

  socket.on("welcome", (x) => {
    console.log("welcome", Object.keys(x));
  });
  socket.on("server_info", (x) => console.log("serv_info", Object.keys(x)));
  console.log("socket initialized");
})().catch((e) => {
  console.error(`exception ${e}`);
});
