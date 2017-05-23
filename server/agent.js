import _ from "lodash";
import Hull from "hull";
import { EventEmitter } from "events";
import cacheManager from "cache-manager";
import SF from "./sf";
import { syncUsers, syncAccounts } from "./sync";
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

function getUsersMatchingSegments(users, segmentIds = []) {
  return users.filter((user) => {
    const ids = (user.segments || []).map(s => s.id);
    return _.intersection(ids, segmentIds).length > 0;
  });
}

const Cache = cacheManager.caching({ store: "memory", max: 100, ttl: 60 });

export default class Agent extends EventEmitter {

  static syncUsers({ client, ship }, messages) {
    const { organization, secret } = client.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);
    const matchingUsers = getUsersMatchingSegments(messages, config.sync.userSegmentIds);
    let result = Promise.resolve({});
    if (matchingUsers.length > 0) {
      result = agent.connect().then(() => {
        return agent.syncUsers(matchingUsers.map(u => u.user));
      });
    }
    return result;
  }

  static syncAccounts({ client, ship }, messages) {
    const { organization, secret } = client.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);
    const matchingAccounts = messages; // getUsersMatchingSegments(messages, config.sync.accountSegmentIds);
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
      const sync_at = new Date().getTime();
      return agent.fetchChanges(options).then(() => {
        hull.get(ship.id).then(({ settings }) => {
          hull.put(ship.id, { settings: {
            ...settings, last_sync_at: sync_at
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
    }
    const err = new Error("Missing credentials");
    err.status = 403;
    return Promise.reject(err);
  }

  connectWithPassword() {
    if (this._connect) return this._connect;
    // Configure with Salesforce and Hull credentials

    this.on("error", (err) => {
      Hull.logger.warn("Sync Error ", err);
    });

    const { login, password, loginUrl } = this.config.salesforce;

    const connect = new Promise((resolve, reject) => {
      // Hull
      this.hull = new Hull(this.config.hull);

      // Salesforce
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

    conn.on("refresh", (access_token) => {
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
      if (!_.isNil(record[salesforceField])) {
        _.set(traits, traitName(source, hullGroupField, salesforceField), record[salesforceField]);
      }
    });

    // Adds hull top level property if the salesforce attribute can be mapped
    _.map(mappings.fetchFieldsToTopLevel, (hullTopLevelField, salesforceField) => {
      if (!_.isNil(record[salesforceField]) && !_.isNil(hullTopLevelField)) {
        _.set(traits, hullTopLevelField, { value: record[salesforceField], operation: "setIfNull" });
      }
    });
    return traits;
  }

  saveRecordTraits(record = {}) {
    const type = record.attributes.type;
    const traits = this.getRecordTraits(type, record);

    if (!_.isEmpty(traits)) {
      const promises = [];

      switch (type) {
        case "Account":
          this.hull.logger.info("incoming.account", traits);
          return this.hull.asAccount({ domain: record.Website }).traits(traits);
        case "Contact":
          this.hull.logger.info("incoming.user", { type, ...traits });
          promises.push(this.hull.asUser({ email: record.Email }).traits(traits));
          // Link with this contact's account
          if (record.Account && !_.isNil(record.Account.Website)) {
            this.hull.logger.debug("account.link", { email: record.Email, domain: record.Account.Website });
            promises.push(this.hull.asUser({ email: record.Email }).account({ domain: record.Account.Website }));
          }
          return Promise.all(promises);
        case "Lead":
          this.hull.logger.info("incoming.user", { type, ...traits });
          return this.hull.asUser({ email: record.Email }).traits(traits);
        default:
          this.hull.logger.warn("unknown record type", { type });
      }
    }
  }

  shouldFetch = (type, fields) => fields && fields.length > 0 && (type !== "Account" || this.config.settings.fetch_accounts);

  fetchAll() {
    const { mappings } = this.config;
    return Promise.all(_.map(mappings, ({ type, fetchFields }) => {
      const fields = _.keys(fetchFields);
      if (this.shouldFetch(type, fields)) {
        return this.sf.getAllRecords({ type, fields }, record => this.saveRecordTraits(record));
      }
    }));
  }

  fetchChanges(options = {}) {
    const { mappings } = this.config;
    return Promise.all(_.map(mappings, ({ type, fetchFields }) => {
      const fields = _.keys(fetchFields);
      if (this.shouldFetch(type, fields)) {
        return this.sf.getUpdatedRecords(type, { ...options, fields });
      }
      return [];
    }))
    .then(_.flatten)
    .then((records) => {
      const promises = records.map(record => this.saveRecordTraits(record));
      return Promise.all(promises).then(() => { return { records }; });
    });
  }

  syncUsers(users) {
    const mappings = this.config.mappings;
    const emails = users.map(u => u.email);
    const sfRecords = this.sf.searchEmails(emails, mappings);
    return sfRecords.then((searchResults) => {
      const recordsByType = syncUsers(searchResults, users, { mappings });
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
    const { ids, domains } = accounts.reduce((identifiers, account) => {
      if (account["salesforce/id"]) {
        identifiers.ids.push(account["salesforce/id"]);
      } else if (account.domain) {
        identifiers.domains.push(account.domain);
      }
      return identifiers;
    }, { ids: [], domains: [] });

    const sfAccountsByDomains = this.sf.searchDomains(domains, mappings);
    const sfAccountsByIds = this.sf.getRecordsByIds("Account", ids, { fields: Object.keys(mappings.Account.fields) })
      .then((records) => {
        // Build an account lookup object by ids
        return records.reduce((accu, record) => {
          accu[record.Id] = record;
          return accu;
        }, {});
      });

    return Promise.all([sfAccountsByDomains, sfAccountsByIds]).then((sfRecords) => {
      // Merge accounts found by ids and by domains
      const searchResults = Object.assign(sfRecords[0], sfRecords[1]);

      const records = syncAccounts(searchResults, accounts, mappings.Account);
      let upsertResults = [];

      if (records && records.length > 0) {
        upsertResults = this.sf.upsert("Account", records, "Id").then((results) => {
          _.map(records, record => this.hull.logger.info("outgoing.account", record));
          return { results, records };
        });
      }

      return Promise.all(upsertResults).then((results) => {
        return results.reduce((rr, r) => {
          if (r) {
            rr.Account = r;
          }
          return rr;
        }, {});
      });
    });
  }
}
