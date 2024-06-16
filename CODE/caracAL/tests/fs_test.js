setInterval(() => {
  const fs = require("fs"),
    filename = "./easteregg.txt";
  fs.readFile(filename, "utf8", function (err, data) {
    if (err) throw err;
    console.log("OK: " + filename);
    console.log(data);
  });
}, 5000);
