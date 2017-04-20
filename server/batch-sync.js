import _ from "lodash";
import Promise from "bluebird";
import Agent from "./agent";

const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || 99, 10);
const BATCH_THROTTLE = parseInt(process.env.BATCH_THROTTLE || 30000, 10);
const HANDLERS = {};

export default class BatchSyncHandler {

  static exit() {
    if (!BatchSyncHandler.exiting) {
      const exiting = Promise.all(_.map(HANDLERS, h => h.flush()));
      BatchSyncHandler.exiting = exiting;
      return exiting;
    }
    return Promise.resolve([]);
  }

  static getHandler({ hull, ship, options }) {
    HANDLERS[ship.id] = HANDLERS[ship.id] || new BatchSyncHandler({ hull, ship, options });
    return HANDLERS[ship.id];
  }

  static handle(message, { hull, ship, options }) {
    if (!BatchSyncHandler.exiting) {
      return BatchSyncHandler
        .getHandler({ hull, ship, options })
        .addUser(message, { hull, ship });
    }
    const err = new Error("Exiting...");
    err.status = 503;
    return Promise.reject(err);
  }

  constructor({ hull, ship, options = {} }) {
    this.hull = hull;
    this.ship = ship;
    this.options = {
      maxSize: MAX_BATCH_SIZE,
      throttle: BATCH_THROTTLE,
      ...options
    };
    this.metric = (metric, value = 1) => {
      this.hull.logger.info("metric", `bulk.${metric}`, value);
    };

    this.users = {};
    this.accounts = {};
    this.status = "idle";
    this.flushLater = _.throttle(this.flush.bind(this), this.options.throttle);
    this.stats = {
      users: { flush: 0, add: 0, flushing: 0, success: 0, error: 0, pending: 0 },
      accounts: { flush: 0, add: 0, flushing: 0, success: 0, error: 0, pending: 0 }
    };
    setInterval(this.debugStats.bind(this), 10000);
  }

  debugStats() {
    this.hull.logger.debug("batch.stats", this.stats);
  }

  add(message, { hull, ship }) {
    this.hull = hull;
    this.ship = ship;

    if (message.user) {
      this.users[message.user.id] = message;
      this.stats.users.add += 1;
      this.stats.users.pending += 1;
    } else if (message.account) {
      this.accounts[message.account.id] = message;
      this.stats.accounts.add += 1;
      this.stats.accounts.pending += 1;
    } else {
      return Promise.reject(new Error(`Unknown subject type for message: ${message}`));
    }

    const { maxSize = MAX_BATCH_SIZE } = this.options;

    if (Object.keys(this.users).length > maxSize) {
      this.flushUsers();
    } else if (Object.keys(this.accounts).length > maxSize) {
      this.flushAccounts();
    } else {
      this.flushLater();
    }
    return this;
  }

  flushUsers() {
    const stats = this.stats.users;
    this.metric("flush");
    stats.flush += 1;
    stats.flushing += 1;
    const users = _.values(this.users);
    this.users = {};
    stats.pending -= users.length;
    return Agent
      .syncUsers(this.hull, this.ship, users)
      .then(() => {
        this.hull.logger.info("flush.success", { users: users.length });
        this.metric("flush.success");
        stats.success += 1;
        stats.flushing -= 1;
      }, (err) => {
        this.hull.logger.error("flush.error", err);
        this.metric("flush.error");
        stats.error += 1;
        stats.flushing -= 1;
      });
  }

  flushAccounts() {
    const stats = this.stats.accounts;
    this.metric("flush");
    stats.flush += 1;
    stats.flushing += 1;
    const accounts = _.values(this.accounts);
    this.accounts = {};
    stats.pending -= accounts.length;
    return Agent
      .syncAccounts(this.hull, this.ship, accounts)
      .then(() => {
        this.metric("flush.success");
        stats.success += 1;
        stats.flushing -= 1;
      }, (err) => {
        this.log("flush.error", err);
        this.metric("flush.error");
        stats.error += 1;
        stats.flushing -= 1;
      });
  }
}
