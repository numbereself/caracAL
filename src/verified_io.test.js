const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { verified_io } = require("./verified_io");

describe("verified_io", () => {
  it("every socket verifies the server's certificate, whatever the page asks (its other options kept); io's properties kept", () => {
    const calls = [];
    const io = (...a) => (calls.push(a), "socket");
    io.Manager = function Manager() {};
    io.protocol = 5;
    const v = verified_io(io);
    assert.equal(
      v("https://de.adventure.land", {
        path: "/ws6/",
        transports: ["websocket"],
        rejectUnauthorized: false,
      }),
      "socket",
    );
    v.connect("https://x", undefined);
    v({ path: "/p" });
    assert.deepEqual(calls, [
      [
        "https://de.adventure.land",
        { path: "/ws6/", transports: ["websocket"], rejectUnauthorized: true },
      ],
      ["https://x", { rejectUnauthorized: true }],
      [{ path: "/p", rejectUnauthorized: true }],
    ]);
    assert.equal(v.Manager, io.Manager);
    assert.equal(v.protocol, 5);
  });
});
