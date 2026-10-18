//caracAL runs the code a game server sends without a browser's sandbox,
//so it only connects to the hosts it trusts: adventure.land and this machine
const net = require("net");

const OFFICIAL = "https://adventure.land";

//hostnames as new URL() gives them: IPv4 in dotted decimal (127.1 becomes 127.0.0.1), IPv6 in brackets
function is_loopback(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") {
    return true;
  }
  return net.isIPv4(hostname) && hostname.startsWith("127.");
}

function is_official(base_url) {
  return new URL(base_url).origin === OFFICIAL;
}

function check_base_url(base_url) {
  const url = new URL(base_url);
  const official = url.origin === OFFICIAL;
  const local =
    (url.protocol === "http:" || url.protocol === "https:") &&
    is_loopback(url.hostname);
  if (!official && !local) {
    throw new Error(
      `refusing base_url ${base_url}: caracAL connects to ${OFFICIAL} or a server on this machine (localhost) only`,
    );
  }
}

//the address the game socket connects to: the official realms over wss, a local server's realms on this machine.
//the server list gives a realm's host (a local server's with its port), sometimes with a scheme in front
function socket_address(base_url, realm_host) {
  const official = is_official(base_url);
  const scheme = new URL(base_url).protocol === "http:" ? "ws:" : "wss:";
  const at = realm_host.indexOf("://");
  const host = at === -1 ? realm_host : realm_host.slice(at + 3);
  const realm = new URL(`${scheme}//${host}`);
  const trusted = official
    ? realm.hostname === "adventure.land" ||
      realm.hostname.endsWith(".adventure.land")
    : is_loopback(realm.hostname);
  if (!trusted) {
    throw new Error(
      `refusing the game server ${realm.hostname}: ${official ? "not adventure.land" : "not on this machine"}`,
    );
  }
  return `${scheme}//${realm.host}`;
}

exports.OFFICIAL = OFFICIAL;
exports.is_loopback = is_loopback;
exports.is_official = is_official;
exports.check_base_url = check_base_url;
exports.socket_address = socket_address;
