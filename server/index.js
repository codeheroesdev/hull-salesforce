import express from "express";
import Hull from "hull";
import server from "./server";

if (process.env.NEW_RELIC_LICENSE_KEY) {
  Hull.logger.warn("starting newrelic with key: ", process.env.NEW_RELIC_LICENSE_KEY);
  require("newrelic");
}

const config = {
  hostSecret: process.env.SECRET || "BOOM",
  port: process.env.PORT || 8082,
  salesforce: {
    oauth2: {
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET
    }
  },
};

const connector = new Hull.Connector(config);
const app = express();

connector.setupApp(app);

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

server(app, config);
connector.startApp(app);
