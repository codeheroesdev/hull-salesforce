import Hull from "hull";

if (process.env.NEW_RELIC_LICENSE_KEY) {
  Hull.logger.warn("starting newrelic with key: ", process.env.NEW_RELIC_LICENSE_KEY);
  require("newrelic");
}

const Server = require("./server").default;
const config = require("./config").config(process.env);

const PORT = process.env.PORT || 8082;

Hull.logger.warn(`Starting on PORT ${PORT}`);
const server = Server(config);
server.listen(PORT);

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
