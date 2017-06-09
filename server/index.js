import express from "express";
import Hull from "hull";
import server from "./server";

if (process.env.NEW_RELIC_LICENSE_KEY) {
  Hull.logger.warn("starting newrelic with key: ", process.env.NEW_RELIC_LICENSE_KEY);
  // eslint-disable-next-line global-require
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

server(app, config);
connector.startApp(app);
