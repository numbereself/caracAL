
const { log, ctype_to_clid, fakePinoConsole } = require("../src/LogUtils");

//basic test
console.log("I am not jsonl, so I dont get formatted");
log.info({type:"hello world"}, "I am jsonl so I get formatted");
log.debug("I usually dont get logged because my level is too low");
log.error({type:"self important message"}, "my level is high on life");
//error formatting
log.warn(new Error('kaboom'))

//clid color formatting test
log.info({"cname":"CodeGorm", clid:ctype_to_clid["warrior"]},"Can I have a cookie")

log.info({"cname":"CodeAnna", clid:ctype_to_clid["merchant"]},"No.")

log.info({"cname":"CodeGorm", clid:ctype_to_clid["warrior"]},"Please?")

log.info({"cname":"CodeAnna", clid:ctype_to_clid["merchant"]},"Okay.")

log.info({"cname":"CodeTrin", clid:ctype_to_clid["rogue"]},"Can I also have a cookie?")

log.info({"cname":"CodeFake"},"You guys are getting cookies?")

log.info({"cname":"CodeDad", clid: 1924},"Hello getting cookies im Dad.")

log.info({val: 42})

log.info({val: 43}, "But what is the question?")

log.info({type:"50 shades of", val: "green", col:"green"})

log.info({type:"animals", col: "red"}, "foxes are")

log.info({type:"big if true", col: "bold"}, "im dummy thicc")

log.info({type:"node executable location", val:process.execPath});

log.info({type:"what happens if msg is an object?", col:"green"}, {hallo:"welt"});

const conn = fakePinoConsole(log);

conn.log(process.execPath)
conn.info("the floor is lava")
conn.warn("the floor is %s", "gooey");
conn.warn("the floor is %s", "sort of %s", "idunno");
conn.warn();
conn.table({"hallo":"welt"});

log.warn({type:"finish"}, "thats all folks");