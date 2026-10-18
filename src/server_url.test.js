const test = require("node:test");
const assert = require("node:assert");
const { is_loopback, check_base_url, socket_address } = require("./server_url");

test("loopback hosts", () => {
  for (const host of ["localhost", "127.0.0.1", "127.1.2.3", "[::1]"]) {
    assert.ok(is_loopback(host), host);
  }
  for (const host of [
    "adventure.land",
    "192.168.1.2",
    "127.0.0.1.example.com",
    "127.example.com",
    "127.345.456.567",
    "localhost.example.com",
  ]) {
    assert.ok(!is_loopback(host), host);
  }
});

test("base_url: adventure.land or this machine only", () => {
  check_base_url("https://adventure.land");
  check_base_url("https://adventure.land/");
  check_base_url("http://localhost:8083");
  check_base_url("https://127.0.0.1:8083");
  check_base_url("http://[::1]:8083");
  for (const url of [
    "http://adventure.land",
    "https://my.server.example",
    "http://192.168.1.2:8083",
    "https://adventure.land.example.com",
    "https://adventure.land@evil.com",
    "https://evil.com#adventure.land",
    "ftp://localhost",
  ]) {
    assert.throws(() => check_base_url(url), /refusing base_url/, url);
  }
});

test("game socket: adventure.land's realms over wss, a local server's on this machine", () => {
  assert.strictEqual(
    socket_address("https://adventure.land", "eu1.adventure.land"),
    "wss://eu1.adventure.land",
  );
  assert.strictEqual(
    socket_address("https://adventure.land", "wss://de.adventure.land"),
    "wss://de.adventure.land",
  );
  assert.strictEqual(
    socket_address("http://localhost:8083", "127.0.0.1"),
    "ws://127.0.0.1",
  );
  assert.strictEqual(
    socket_address("http://localhost:8083", "localhost:7200"),
    "ws://localhost:7200",
  );
  assert.strictEqual(
    socket_address("https://localhost:8083", "localhost:7200"),
    "wss://localhost:7200",
  );
  assert.strictEqual(
    socket_address("http://localhost:8083", "localhost:443"),
    "ws://localhost:443",
  );
  assert.strictEqual(
    socket_address("http://localhost:8083", "ws://localhost:7200"),
    "ws://localhost:7200",
  );
  assert.throws(
    () => socket_address("https://adventure.land", "evil.example.com"),
    /not adventure.land/,
  );
  assert.throws(
    () =>
      socket_address("https://adventure.land", "adventure.land.example.com"),
    /not adventure.land/,
  );
  //only the host counts: a hash, query, path or user info can't make another host trusted
  for (const realm of [
    "evil.com#de.adventure.land",
    "evil.com?x=.adventure.land",
    "evil.com/de.adventure.land",
    "de.adventure.land@evil.com",
    "wss://evil.com/x://de.adventure.land",
  ]) {
    assert.throws(
      () => socket_address("https://adventure.land", realm),
      /refusing the game server evil.com/,
      realm,
    );
  }
  assert.throws(
    () => socket_address("http://localhost:8083", "eu1.adventure.land"),
    /not on this machine/,
  );
});
