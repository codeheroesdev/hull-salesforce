import Hull from "hull";
import { Agent } from "./agent";
import { Server } from "./server";
import config from "./config";
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

export default { Agent, Server, config };
