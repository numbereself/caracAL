const path = require("node:path");
const WebpackWatchedGlobEntries = require("webpack-watched-glob-entries-plugin");

module.exports = {
  mode: "none",
  entry: WebpackWatchedGlobEntries.getEntries(
    [
      // Your path(s)
      path.resolve(__dirname, "TYPECODE/**/*.ts"),
    ],
    {
      // Optional glob options that are passed to glob.sync()
      ignore: "**/*.lib.ts",
    },
  ),
  plugins: [new WebpackWatchedGlobEntries()],
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: [path.resolve(__dirname, "TYPECODE")],
        use: "ts-loader",
      },
    ],
  },
  output: {
    path: path.resolve(__dirname, "TYPECODE.out"),
    clean: true,
  },
};
