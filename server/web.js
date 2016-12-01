if (process.env.NEW_RELIC_LICENSE_KEY) {
  console.warn('starting newrelic with key: ', process.env.NEW_RELIC_LICENSE_KEY);
  require('newrelic');
}

var Server = require('./server').default;
var config = require('./config').config(process.env);
var PORT = process.env.PORT || 8082;

console.warn("Starting on PORT " + PORT);
const server = Server(config);
server.listen(PORT);

function exitNow() {
  console.warn("Exiting now !");
  process.exit();
}

function handleExit() {
  console.log("Exiting... waiting 30 seconds workers to flush");
  setTimeout(exitNow, 30000);
  server.exit().then(exitNow);
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);
