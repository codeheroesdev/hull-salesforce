import _ from "lodash";
import Promise from "bluebird";
import Agent from "./agent";

const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || 200, 10);
const BATCH_THROTTLE = parseInt(process.env.BATCH_THROTTLE || 30000, 10);
const HANDLERS = {};

export default class BatchSyncHandler {

  static exit() {
    if (!BatchSyncHandler.exiting) {
      const exiting = Promise.all(_.map(HANDLERS, (h) => h.flush()));
      BatchSyncHandler.exiting = exiting;
      return exiting;
    }
    return Promise.resolve([]);
  }

  static getHandler({ hull, ship, options }) {
    return HANDLERS[ship.id] = HANDLERS[ship.id] || new BatchSyncHandler({ hull, ship, options });
  }

  static handle(message, { hull, ship, options }) {
    if (!BatchSyncHandler.exiting) {
      return BatchSyncHandler
        .getHandler({ hull, ship, options })
        .add(message, { hull, ship });
    } else {
      const err = new Error("Exiting...");
      err.status = 503;
      return Promise.reject(err);
    }
  }

  constructor({ hull, ship, options={} }) {
    this.hull = hull;
    this.ship = ship;
    this.options = {
      maxSize: MAX_BATCH_SIZE,
      throttle: BATCH_THROTTLE,
      ...options
    };
    this.metric = (metric, value) => {
      this.hull.utils.metric(`bulk.${metric}`, value);
    };

    this.log = this.hull.utils.log;
    this.users = {};
    this.status = "idle";
    this.flushLater = _.throttle(this.flush.bind(this), this.options.throttle);
    this.stats = { flush: 0, add: 0, flushing: 0, success: 0, error: 0, pending: 0 };
    setInterval(this.debugStats.bind(this), 1000);
  }

  debugStats() {
    console.warn(`BatchSyncHandler ${this.ship.id}`, this.stats);
  }

  add(message, { hull, ship }) {
    this.stats.add += 1;
    this.stats.pending += 1;
    this.hull = hull;
    this.ship = ship;
    this.users[message.user.id] = message;

    const { maxSize = MAX_BATCH_SIZE } = this.options;

    if (Object.keys(this.users).length > maxSize) {
      this.flush();
    } else {
      this.flushLater();
    }
    return this;
  }

  flush() {
    this.metric("flush");
    this.stats.flush += 1;
    this.stats.flushing += 1;
    const users = _.values(this.users);
    this.users = {};
    this.stats.pending -= users.length;
    return Agent
      .syncUsers(this.hull, this.ship, users)
      .then((result) => {
        this.metric("flush.success");
        this.stats.success += 1;
        this.stats.flushing -= 1;
      }, (err) => {
        this.log("flush.error", err);
        this.metric("flush.error");
        this.stats.error += 1;
        this.stats.flushing -= 1;
      });
  }
}

