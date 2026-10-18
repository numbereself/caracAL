// The game's page opens its socket with socket.io-client's io(server, { ..., rejectUnauthorized: false }): a browser
// ignores that option and verifies the server's certificate anyway, Node's client honours it and doesn't (the login
// and everything after it over TLS anyone on the way could intercept). The page's io here verifies, as a browser does.

/** socket.io-client's io, every socket it opens with the server's certificate verified */
function verified_io(io) {
  const v = (uri, opts) =>
    uri !== null && typeof uri === "object"
      ? io({ ...uri, rejectUnauthorized: true })
      : io(uri, { ...(opts || {}), rejectUnauthorized: true });
  return Object.assign(v, io, { connect: v });
}

module.exports = { verified_io };
