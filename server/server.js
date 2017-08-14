import _ from "lodash";
import express from "express";
import cors from "cors";
import path from "path";
import { NotifHandler, BatchHandler, Middleware, OAuthHandler } from "hull";
import { Strategy } from "passport-forcedotcom";
import bodyParser from "body-parser";
import librato from "librato-node";
import { renderFile } from "ejs";

import BatchSyncHandler from "./batch-sync";
import Agent from "./agent";
import statusCheck from "./lib/status-check";


function save(hull, ship, settings) {
  return hull.put(ship.id, {
    private_settings: {
      ...ship.private_settings,
      ...settings
    }
  });
}


export default function Server({ hostSecret }) {
  if (process.env.LIBRATO_TOKEN && process.env.LIBRATO_USER) {
    librato.configure({
      email: process.env.LIBRATO_USER,
      token: process.env.LIBRATO_TOKEN
    });
    // librato.on("error", () => {
    //   console.error(err);
    // });

    process.once("SIGINT", () => {
      librato.stop(); // stop optionally takes a callback
    });

    librato.start();
  }

  const app = express();

  app.set("views", `${__dirname}/../views`);
  app.set("view engine", "ejs");
  app.engine("html", renderFile);
  app.use(express.static(path.resolve(__dirname, "..", "dist")));
  app.use(express.static(path.resolve(__dirname, "..", "assets")));

  app.use("/auth", (req, res, next) => {
    const token = req.query.token || req.query.state;
    if (token && token.split(".").length === 3) {
      req.hull = req.hull || {};
      req.hull.token = token;
    }
    next();
  }, Middleware({ hostSecret }), (req, res, next) => {
    const oauthUrl = req.hull.ship.private_settings.salesforce_oauth_url || "https://login.salesforce.com";
    OAuthHandler({
      hostSecret,
      name: "Salesforce",
      Strategy,
      options: {
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET, // Client Secret
        authorizationURL: `${oauthUrl}/services/oauth2/authorize`,
        tokenURL: `${oauthUrl}/services/oauth2/token`,
        scope: ["refresh_token", "api"] // App Scope
      },
      isSetup(req, { /* hull,*/ ship }) {
        if (!!req.query.reset) return Promise.reject();
        const { access_token, refresh_token, instance_url } = ship.private_settings || {};

        if (access_token && refresh_token && instance_url) return Promise.resolve(ship);

        return Promise.reject();
      },
      onLogin: (req, { hull, ship }) => {
        req.authParams = { ...req.body, ...req.query };
        return Promise.resolve(req.authParams);
      },
      onAuthorize: (req, { hull, ship }) => {
        const { refreshToken, params } = (req.account || {});
        const { access_token, instance_url } = params || {};
        const salesforce_login = _.get(req, "account.profile._raw.username");
        return save(hull, ship, {
          refresh_token: refreshToken,
          access_token, instance_url, salesforce_login
        });
      },
      views: {
        login: "login.html",
        home: "home.html",
        failure: "failure.html",
        success: "success.html"
      },
    })(req, res, next);
  });

  app.post("/sync", Middleware({ hostSecret }), (req, res) => {
    const { client: hull, ship } = req.hull;
    Agent.fetchChanges(hull, ship).then((result) => {
      res.json({ ok: true, result });
    }).catch((err) => {
      hull.logger.error("sync error", { message: err.message, status: err.status });
      res.status(err.status || 500);
      res.json({ ok: false, error: err.message });
    });
  });

  app.post("/fetch-all", Middleware({ hostSecret }), (req, res) => {
    const { client: hull, ship } = req.hull;
    Agent.fetchAll(hull, ship).then((result) => {
      res.json({ ok: true, result });
    }).catch((err) => {
      hull.logger.error("fetch-all error", { message: err.message, status: err.status });
      res.status(err.status || 500);
      res.json({ ok: false, error: err.message });
    });
  });

  app.post("/notify", NotifHandler({
    hostSecret,
    groupTraits: false,
    onSusbscribe(message, context) {
      console.warn("Hello new subscriber !", { message, context });
    },
    onError(message, status) {
      console.warn("Error", status, message);
    },
    handlers: {
      "user:update": ({ message }, { ship, hull }) => {
        try {
          BatchSyncHandler.handle(message, { ship, hull });
          if (process.env.LIBRATO_TOKEN && process.env.LIBRATO_USER) {
            librato.increment("user_report:update", 1, { source: ship.id });
          }
          return true;
        } catch (err) {
          hull.logger.error("Error in Users sync", { err });
          return err;
        }
      }
    }
  }));

  app.post("/batch", BatchHandler({
    hostSecret,
    batchSize: 2000,
    groupTraits: false,
    handler(notifications = [], { ship, hull }) {
      const users = notifications.map(n => n.message);
      return Agent
        .syncUsers(hull, ship, users, { applyFilters: false })
        .then(() => console.warn("batch done"))
        .catch(err => hull.logger.error("batch err", { err }));
    }
  }));

  app.get("/manifest.json", (req, res) => {
    res.sendFile(path.resolve(__dirname, "..", "manifest.json"));
  });

  app.get("/schema(/:type)", cors(), Middleware({ hostSecret, requireCredentials: false }), (req, res) => {
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

  app.all("/status", Middleware({ hostSecret }), statusCheck);

  return {
    listen: port => app.listen(port),
    exit: () => BatchSyncHandler.exit()
  };
}
