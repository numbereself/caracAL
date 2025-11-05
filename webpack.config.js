const path = require("node:path");
const WebpackWatchedGlobEntries = require("webpack-watched-glob-entries-plugin");

module.exports = {
  mode: "none",
  entry: WebpackWatchedGlobEntries.getEntries(
    [
      // Internal TYPECODE directory
      path.resolve(__dirname, "TYPECODE/**/*.ts"),
      // External caracAL-scripts directory
      path.resolve(__dirname, "../caracAL-scripts/**/*.ts"),
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
        include: [
          path.resolve(__dirname, "TYPECODE"),
          path.resolve(__dirname, "../caracAL-scripts"),
        ],
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.resolve(__dirname, "tsconfig.json"),
          },
        },
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    alias: {
      "@library": path.resolve(__dirname, "../caracAL-scripts/library"),
      "@classes": path.resolve(__dirname, "../caracAL-scripts/classes"),
      "@caracal": path.resolve(__dirname, "TYPECODE/caracAL"),
    },
  },
  output: {
    path: path.resolve(__dirname, "TYPECODE.out"),
    clean: {
      keep: /\.gitignore$/,
    },
  },
};
