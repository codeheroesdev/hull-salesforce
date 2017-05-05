import Hull from "hull";
import { Agent } from "./agent";
import { Server } from "./server";
import config from "./config";

Hull.logger.transports.console.json = true;
Hull.logger.info("start", { transport: "console" });

export default { Agent, Server, config };
