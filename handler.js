const serverless = require("serverless-http");
const app = require("./src/app");

// ⚡ AWS Lambda Serverless Handler
module.exports.handler = serverless(app);

