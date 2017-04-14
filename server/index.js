import librato from "librato-node";
import Hull from "hull";
import { name } from "../manifest.json";

if (process.env.LOGSTASH_HOST && process.env.LOGSTASH_PORT) {
  const Logstash = require("winston-logstash").Logstash; // eslint-disable-line global-require
  Hull.logger.add(Logstash, {
    node_name: name,
    port: process.env.LOGSTASH_PORT || 1515,
    host: process.env.LOGSTASH_HOST
  });
  Hull.logger.info("start", { transport: "logstash" });
} else {
  Hull.logger.info("start", { transport: "console" });
}

if (process.env.LIBRATO_TOKEN && process.env.LIBRATO_USER) {
  librato.configure({
    email: process.env.LIBRATO_USER,
    token: process.env.LIBRATO_TOKEN
  });
  librato.on("error", (err) => {
    console.error(err);
  });
  process.once("SIGINT", () => {
    librato.stop(); // stop optionally takes a callback
  });
  librato.start();
}
