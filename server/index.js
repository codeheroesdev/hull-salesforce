import librato from "librato-node";
import Hull from "hull";

Hull.logger.transports.console.json = true;
Hull.logger.info("start", { transport: "console" });

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
