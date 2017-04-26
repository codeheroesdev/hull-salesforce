import _ from "lodash";
import Hull from "hull";
import { EventEmitter } from "events";
import cacheManager from "cache-manager";
import SF from "./sf";
import { syncRecords } from "./sync";
import Connection from "./connection";
import { buildConfigFromShip } from "./config";

function toUnderscore(str) {
  return str
    .replace(/([A-Z])/g, c => `_${c.toLowerCase()}`)
    .replace(/^_/, "");
}

function traitName(source, hullGroupField, salesforceField) {
  return !_.isNil(hullGroupField) ? `${source}/${hullGroupField}` : `${source}/${toUnderscore(salesforceField)}`;
}

const Cache = cacheManager.caching({ store: "memory", max: 100, ttl: 60 });

export default class Agent extends EventEmitter {

  static syncUsers(hull, ship, users, options = {}) {
    const { applyFilters = true } = options;
    const { organization, secret } = hull.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);
    const matchingUsers = applyFilters ? agent.getUsersMatchingSegments(users) : users;
    let result = Promise.resolve({});
    if (matchingUsers.length > 0) {
      result = agent.connect().then(() => {
        return agent.syncUsers(matchingUsers.map(u => u.user));
      });
    }

    return result;
  }

  static syncAccounts(hull, ship, accounts, options = {}) {
    const { applyFilters = true } = options;
    const { organization, secret } = hull.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);
    const matchingAccounts = applyFilters ? agent.getAccountsMatchingSegments(accounts) : accounts;
    let result = Promise.resolve({});
    if (matchingAccounts.length > 0) {
      result = agent.connect().then(() => {
        return agent.syncAccounts(matchingAccounts.map(a => a.account));
      });
    }

    return result;
  }

  static fetchAll(hull, ship) {
    const { organization, secret } = hull.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);
    return agent.connect().then(() => {
      agent.fetchAll();
      return true;
    });
  }

  static fetchChanges(hull, ship, options = {}) {
    const { organization, secret } = hull.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);
    const last_sync_at = parseInt(_.get(ship, "settings.last_sync_at"), 10);
    const since = new Date(last_sync_at - 60000);
    if (since && since.getYear() === new Date().getYear()) {
      options.since = since;
    }

    return agent.connect().then(() => {
      const last_sync_at = new Date().getTime();
      return agent.fetchChanges(options).then(() => {
        hull.get(ship.id).then(({ settings }) => {
          hull.put(ship.id, { settings: {
            ...settings, last_sync_at
          } });
        });
      });
    });
  }

  static getFieldsSchema(hull, ship) {
    if (!hull || !ship) {
      return Promise.resolve({});
    }
    const { organization, secret } = hull.configuration();
    const cacheKey = [ship.id, ship.updated_at, secret].join("/");
    return Cache.wrap(cacheKey, () => {
      const config = buildConfigFromShip(ship, organization, secret);
      const agent = new Agent(config);
      return agent.connect().then(() => {
        return agent.getFieldsSchema();
      });
    });
  }

  constructor(config = {}) {
    super();
    this.pages = [];
    this.config = config;
    this.status = "pending";
  }

  connect() {
    if (this._connect) return this._connect;
    const { salesforce } = this.config;
    if (salesforce.accessToken && salesforce.instanceUrl) {
      return this.connectWithToken();
    } else if (salesforce.login && salesforce.password) {
      return this.connectWithPassword();
    } else {
      const err = new Error("Missing credentials");
      err.status = 403;
      return Promise.reject(err);
    }
  }

  connectWithPassword() {
    if (this._connect) return this._connect;
    // Configure with Salesforce and Hull credentials

    this.on("error", (err) => {
      Hull.logger.warn("Sync Error ", err);
    });

    const connect = new Promise((resolve, reject) => {
      // Hull
      this.hull = new Hull(this.config.hull);

      // Salesforce
      const { login, password, loginUrl } = this.config.salesforce;
      const conn = new Connection({ loginUrl });
      conn.setShipId(this.config.hull.id);
      if (login && password) {
        conn.login(login, password, (err, userInfo) => {
          if (err) {
            this.emit("error", err);
            reject(err);
          } else {
            this.emit("connect", userInfo);
            this.sf = new SF(conn, this.hull.logger);
            this.userInfo = userInfo;
            resolve(conn);
          }
        });
      } else {
        reject(new Error("Salesforce credentials missing"));
      }
    });

    connect.catch((err) => {
      Hull.logger.error("Error establishing connection with Salesforce: for ", login, err);
      return err;
    });

    this._connect = connect;
    return connect;
  }

  connectWithToken() {
    if (this._connect) return this._connect;
    const shipId = this.config.hull.id;
    const conn = new Connection(this.config.salesforce);
    conn.setShipId(shipId);

    this.hull = new Hull(this.config.hull);
    this.sf = new SF(conn, this.hull.logger);
    this._connect = Promise.resolve(conn);

    conn.on("refresh", (access_token, res) => {
      this.hull.get(shipId).then(({ private_settings }) => {
        this.hull.put(shipId, {
          private_settings: {
            ...private_settings,
            access_token
          }
        });
      });
    });

    return this._connect;
  }

  getSubjectsMatchingSegmentsIds(subjects, segmentIds) {
    return subjects.filter(subject => {
      const ids = (subject.segments || []).map(s => s.id);
      return _.intersection(ids, segmentIds).length > 0;
    });
  }

  getUsersMatchingSegments(users) {
    const { segmentIds } = this.config.sync || {};
    return this.getSubjectsMatchingSegmentsIds(users, segmentIds);
  }

  getAccountsMatchingSegments(accounts) {
    // TODO: Define config format for accout segments
    const { segmentIds } = this.config.sync_accounts || {};
    return this.getSubjectsMatchingSegmentsIds(accounts, segmentIds);
  }

  getFieldsSchema() {
    const { mappings } = this.config;
    return Promise.all(_.map(mappings, ({ type }) => {
      return this.sf.getFieldsList(type).then((fields) => {
        return { type: type.toLowerCase(), fields };
      });
    })).then((fieldsByType) => {
      return fieldsByType.reduce((schema, { fields, type }) => {
        return { ...schema,
          [`${type}`]: _.map(fields, "name").sort(),
          [`${type}_updateable`]: _.map(_.filter(fields, { updateable: true }), "name").sort(),
          [`${type}_custom`]: _.map(_.filter(fields, { custom: true }), "name").sort()
        };
      }, {});
    });
  }

  getRecordTraits(type, record) {
    const source = type === "Account" ? "salesforce" : `salesforce_${type.toLowerCase()}`;
    const traits = {};
    const mappings = this.config.mappings[type];

    // Adds salesforce attribute
    _.map(mappings.fetchFields, (hullGroupField, salesforceField) => {
      if (_.has(record, salesforceField)) {
        _.set(traits, traitName(source, hullGroupField, salesforceField), record[salesforceField]);
      }
    });

    // Adds hull top level property if the salesforce attribute can be mapped
    _.map(mappings.fetchFieldsToTopLevel, (hullTopLevelField, salesforceField) => {
      if (!_.isNil(hullTopLevelField) && _.has(record, salesforceField)) {
        _.set(traits, hullTopLevelField, { value: record[salesforceField], operation: "setIfNull" });
      }
    });
    return traits;
  }

  fetchAll() {
    const { mappings } = this.config;
    return Promise.all(_.map(mappings, ({ type, fetchFields }) => {
      const fields = _.keys(fetchFields);
      if (fields && fields.length > 0) {
        return this.sf.getAllRecords({ type, fields }, (record = {}) => {
          const traits = this.getRecordTraits(type, record);
          if (!_.isEmpty(traits)) {
            if (type === "Account" && this.config.settings.fetch_accounts) {
              this.hull.logger.info("incoming.account", { domain: record.Website, ...traits });
              this.hull.asAccount({ domain: record.Website }).traits(traits);
            } else if (type === "Lead" || type === "Contact") {
              this.hull.logger.info("incoming.user", { email: record.Email, ...traits });
              this.hull.asUser({ email: record.Email }).traits(traits);
            }
          }
        });
      }
    }));
  }

  fetchChanges(options = {}) {
    const { mappings } = this.config;
    return Promise.all(_.map(mappings, ({ type, fetchFields }) => {
      const fields = _.keys(fetchFields);
      if (fields && fields.length > 0) {
        return this.sf.getUpdatedRecords(type, { ...options, fields });
      }
      return { type, fields: fetchFields, records: [] };
    })).then((changes) => {
      const promises = [];
      changes.map(({ type, records }) => {
        records.map((record) => {
          const traits = this.getRecordTraits(type, record);
          if (!_.isEmpty(traits)) {
            if (type === "Account" && this.config.settings.fetch_accounts) {
              this.hull.logger.info("incoming.account", { domain: record.Website, ...traits });
              promises.push(this.hull.asAccount({ external_id: record.Id, domain: record.Website }).traits(traits));
            } else if (type === "Lead" || type === "Contact") {
              this.hull.logger.info("incoming.user", { email: record.Email, ...traits });
              promises.push(this.hull.asUser({ email: record.Email }).traits(traits));
            }
          }
        });
      });
      return Promise.all(promises).then(() => { return { changes }; });
    });
  }

  syncUsers(users) {
    const mappings = this.config.mappings;
    const emails = users.map(u => u.email);
    const sfRecords = this.sf.searchEmails(emails, mappings);
    return sfRecords.then((searchResults) => {
      const recordsByType = syncRecords(searchResults, users, { mappings });
      const upsertResults = ["Lead", "Contact"].map((recordType) => {
        const records = recordsByType[recordType];
        if (records && records.length > 0) {
          return this.sf.upsert(recordType, records).then((results) => {
            _.map(records, record => this.hull.logger.info("outgoing.user", record));
            return { recordType, results, records };
          });
        }
      });
      return Promise.all(upsertResults).then((results) => {
        return results.reduce((rr, r) => {
          if (r && r.recordType) {
            rr[r.recordType] = r;
          }
          return rr;
        }, {});
      });
    });
  }

  syncAccounts(accounts) {
    const mappings = this.config.mappings;
    const ids = accounts.map(a => a.id);
    const sfRecords = this.sf.searchIds(ids, mappings);
    return sfRecords.then((searchResults) => {
      const recordsByType = syncRecords(searchResults, accounts, { mappings });
      const upsertResults = ["Account"].map((recordType) => {
        const records = recordsByType[recordType];
        if (records && records.length > 0) {
          return this.sf.upsert(recordType, records, "Id").then((results) => {
            _.map(records, record => this.hull.logger.info("outgoing.account", record));
            return { recordType, results, records };
          });
        }
      });
      return Promise.all(upsertResults).then((results) => {
        return results.reduce((rr, r) => {
          if (r && r.recordType) {
            rr[r.recordType] = r;
          }
          return rr;
        }, {});
      });
    });
  }
}
