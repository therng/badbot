/** @type {import('next').NextConfig} */
const { version } = require("./package.json");
module.exports = {
  reactStrictMode: true,
  output: "standalone",
  env: { NEXT_PUBLIC_APP_VERSION: version },
};
