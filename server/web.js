import express from "express";
import Hull from "hull";
import server from "./server";

if (process.env.NEW_RELIC_LICENSE_KEY) {
  Hull.logger.warn("starting newrelic with key: ", process.env.NEW_RELIC_LICENSE_KEY);
  require("newrelic");
}

const config = require("./config").config(process.env);

config.Hull = Hull;
config.port = process.env.PORT || 8082;

const app = express();
server(app, config);

function exitNow() {
  Hull.logger.warn("Exiting now !");
  process.exit();
}

function handleExit() {
  Hull.logger.log("Exiting... waiting 30 seconds workers to flush");
  setTimeout(exitNow, 30000);
  server.exit().then(exitNow);
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);
