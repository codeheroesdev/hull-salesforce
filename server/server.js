import _ from "lodash";
import cors from "cors";
import librato from "librato-node";
import { notifHandler, batchHandler, oAuthHandler } from "hull/lib/utils";
import { Strategy } from "passport-forcedotcom";
import Agent from "./agent";
import Hull from "hull";

module.exports = function Server(app, options = {}) {
  const { hostSecret, port } = options;
  const connector = new Hull.Connector({ hostSecret, port });

  connector.setupApp(app);

  app.use("/auth", oAuthHandler({
    hostSecret,
    name: "Salesforce",
    Strategy,
    options: {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET, // Client Secret
      scope: ["refresh_token", "api"] // App Scope
    },
    isSetup(req) {
      if (!!req.query.reset) return Promise.reject();
      const { access_token, refresh_token, instance_url } = req.hull.ship.private_settings || {};

      if (access_token && refresh_token && instance_url) return Promise.resolve(req.hull.ship);

      return Promise.reject();
    },
    onLogin: (req) => {
      req.authParams = { ...req.body, ...req.query };
      return Promise.resolve(req.authParams);
    },
    onAuthorize: (req) => {
      const { refreshToken, params } = (req.account || {});
      const { access_token, instance_url } = params || {};
      const salesforce_login = _.get(req, "account.profile._raw.username");
      return req.hull.client.utils.settings.update({
        refresh_token: refreshToken,
        access_token,
        instance_url,
        salesforce_login
      });
    },
    views: {
      login: "login.html",
      home: "home.html",
      failure: "failure.html",
      success: "success.html"
    },
  }));

  app.post("/sync", connector.clientMiddleware(), (req, res) => {
    const { client: hull, ship } = req.hull;
    Agent.fetchChanges(hull, ship).then((result) => {
      res.json({ ok: true, result });
    }).catch((err) => {
      hull.logger.error("sync error", { message: err.message, status: err.status });
      res.status(err.status || 500);
      res.json({ ok: false, error: err.message });
    });
  });

  app.post("/fetch-all", connector.clientMiddleware(), (req, res) => {
    const { client: hull, ship } = req.hull;
    Agent.fetchAll(hull, ship).then((result) => {
      res.json({ ok: true, result });
    }).catch((err) => {
      hull.logger.error("fetch-all error", { message: err.message, status: err.status });
      res.status(err.status || 500);
      res.json({ ok: false, error: err.message });
    });
  });

  app.post("/notify", notifHandler({
    // TODO: add an accountHandlerOptions here ?
    userHandlerOptions: {
      groupTraits: false,
      maxSize: 1,
      maxTime: 1
    },
    hostSecret,
    onSusbscribe(message, context) {
      Hull.logger.warn("Hello new subscriber !", { message, context });
    },
    onError(message, status) {
      Hull.logger.warn("Error", status, message);
    },
    handlers: {
      "user:update": ({ client, ship }, messages) => {
        try {
          Agent.syncUsers({ client, ship }, messages);
          if (process.env.LIBRATO_TOKEN && process.env.LIBRATO_USER) {
            librato.increment("user_report:update", 1, { source: ship.id });
          }
          return true;
        } catch (err) {
          Hull.logger.warn("Error in Users sync", err, err.stack);
          return err;
        }
      },
      // account:update messages are not batched and are received one by one
      "account:update": ({ ship, client }, message) => {
        const messages = [message];
        try {
          Agent.syncAccounts({ client, ship }, messages);
          if (process.env.LIBRATO_TOKEN && process.env.LIBRATO_USER) {
            librato.increment("account_report:update", 1, { source: ship.id });
          }
          return true;
        } catch (err) {
          Hull.logger.warn("Error in Accounts sync", err, err.stack);
          return err;
        }
      }
    }
  }));

  app.post("/batch", batchHandler({
    hostSecret,
    batchSize: 2000,
    groupTraits: false,
    handler(notifications = [], { ship, hull }) {
      const users = notifications.map(n => n.message);
      return Agent
        .syncUsers(hull, ship, users, { applyFilters: false })
        .then(() => Hull.logger.warn("batch done"))
        .catch(err => Hull.logger.warn("batch err", err));
    }
  }));

  app.get("/schema(/:type)", cors(), connector.clientMiddleware({ requireCredentials: false }), (req, res) => {
    const { type } = req.params || {};
    const { client: hull, ship } = req.hull;
    return Agent.getFieldsSchema(hull, ship).then((definitions = {}) => {
      const options = (definitions[type] || []).map((t) => {
        return { value: t, label: t };
      });
      return res.json({ options });
    }).catch((err) => {
      res.json({ ok: false, error: err.message, options: [] });
    });
  });

  connector.startApp(app);

  return app;
};
