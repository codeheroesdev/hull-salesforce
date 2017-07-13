import _ from 'lodash';
import Hull from 'hull';
import { SF } from './sf';
import { syncRecords } from './sync';
import Connection from './connection';
import { getShipConfig, buildConfigFromShip } from './config';
import { EventEmitter } from 'events';
import jsforce from 'jsforce';
import cacheManager from 'cache-manager';

Hull.logger.transports.console.json = true;

function log(a,b,c) {
  if (process.env.DEBUG) {
    console.log(a,b,c)
  }
}

function toUnderscore(str) {
  return str
    .replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`)
    .replace(/^_/, '');
}

const Cache = cacheManager.caching({ store: 'memory', max: 100, ttl: 60 });

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
      return agent.fetchChanges(options).then(() => {
        hull.get(ship.id).then(({ settings }) => {
          hull.put(ship.id, { settings: { ...settings,
            last_sync_at: new Date().getTime()
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
    const cacheKey = [ship.id, ship.updated_at, secret].join('/');
    return Cache.wrap(cacheKey, () => {
      const config = buildConfigFromShip(ship, organization, secret);
      const agent = new Agent(config);
      return agent.connect().then(() => {
        return agent.getFieldsSchema();
      });
    });
  }

  constructor(config={}) {
    super();
    this.pages = [];
    this.config = config;
    this.status = 'pending';
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

    this.on('error', (err) => {
      console.warn('Sync Error ', err);
    });

    let connect = new Promise((resolve, reject) => {
      // Salesforce
      let { login, password, loginUrl } = this.config.salesforce;
      var conn = new Connection({ loginUrl : loginUrl });
      conn.setShipId(this.config.hull.id);
      if (login && password) {
        conn.login(login, password, (err, userInfo) => {
          if (err) {
            this.emit('error', err);
            reject(err);
          } else {
            this.emit('connect', userInfo);
            this.sf = new SF(conn, new Hull(this.config.hull));
            this.userInfo = userInfo;
            resolve(conn);
          }
        });
      } else {
        reject(new Error('Salesforce credentials missing'));
      }

      // Hull
      this.hull = new Hull(this.config.hull);
      conn.setLogger(this.hull.logger);
    });

    connect.catch((err) => {
      console.log('Error establishing connection with Salesforce: for ', login, err)
      return err;
    })

    this._connect = connect;
    return connect;
  }

  connectWithToken() {
    if (this._connect) return this._connect;
    const shipId = this.config.hull.id;
    const conn = new Connection(this.config.salesforce);
    conn.setShipId(shipId);

    this.hull = new Hull(this.config.hull);
    conn.setLogger(this.hull.logger);
    this.sf = new SF(conn, this.hull);
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

  getUsersMatchingSegments(users) {
    const { segmentIds } = this.config.sync || {};
    if (_.isEmpty(segmentIds)) {
      return users;
    }
    return users.filter(user => {
      const ids = (user.segments || []).map(s => s.id);
      return _.intersection(ids, segmentIds).length > 0;
    });
  }

  getFieldsSchema() {
    const { mappings } = this.config;
    return Promise.all(_.map(mappings, ({ type }) => {
      return this.sf.getFieldsList(type).then(fields => {
        return { type: type.toLowerCase(), fields };
      });
    })).then(fieldsByType => {
      return fieldsByType.reduce((schema, { fields, type }) => {
        return { ...schema,
          [`${type}`]: _.map(fields, 'name').sort(),
          [`${type}_updateable`]: _.map(_.filter(fields, { updateable: true }), 'name').sort(),
          [`${type}_custom`]: _.map(_.filter(fields, { custom: true }), 'name').sort()
        };
      }, {});
    })
  }

  fetchAll() {
    const { mappings } = this.config;
    return Promise.all(_.map(mappings, ({ type, fetchFields: fields }) => {
      if (fields && fields.length > 0) {
        this.hull.logger.info("incoming.job.start", { jobName: "fetchAll", type, fetchFields: fields });
        return this.sf.getAllRecords({ type, fields }, (record = {}) => {
          const source = `salesforce_${type.toLowerCase()}`;
          const traits = _.reduce(fields, (t,k) => {
            const val = record[k];
            if (val != null) {
              return { ...t, [`${source}/${toUnderscore(k)}`]: val };
            }
            return t;
          }, {
            first_name: { operation: "setIfNull", value: record.FirstName },
            last_name:  { operation: "setIfNull", value: record.LastName },
            [`${source}/id`]: record.Id
          });
          if (!_.isEmpty(traits)) {
            return this.hull
              .as({ email: record.Email })
              .traits(traits)
              .then(() => this.hull.logger.info("incoming.user.success", { email: record.Email, traits }));
          }
        });
      }
    }));
  }

  fetchChanges(options = {}) {
    const { mappings } = this.config;
    return Promise.all(_.map(mappings, ({ type, fetchFields }) => {
      this.hull.logger.info("incoming.job.start", { jobName: "fetchChanges", type, fetchFields });
      if (fetchFields && fetchFields.length > 0) {
        return this.sf.getUpdatedRecords(type, { ...options, fields: fetchFields });
      }
      return { type, fields: fetchFields, records: [] };
    })).then(changes => {
      changes.map(({ type, records, fields }) => {
        records.map(rec => {
          const source = `salesforce_${type.toLowerCase()}`;
          const traits = _.reduce(fields, (t,k) => {
            return { ...t, [toUnderscore(k)]: rec[k] };
          }, {});
          if (!_.isEmpty(traits)) {
            return this.hull
              .as({ email: rec.Email })
              .traits(traits, { source })
              .then(() => this.hull.logger.info("incoming.user.success", { email: rec.Email, traits }));
          }
        });
      });
      return { changes };
    });
  }

  syncUsers(users) {
    const mappings = this.config.mappings;
    let emails = users.filter(u => u.email).map(u => u.email);
    let sfRecords = this.sf.searchEmails(emails, mappings);
    return sfRecords.then((searchResults)=> {
      let recordsByType = syncRecords(searchResults, users, { mappings });

      var upsertResults = ['Lead', 'Contact'].map((recordType) => {
        let records = recordsByType[recordType];
        if (records && records.length > 0) {
          return this.sf.upsert(recordType, records).then((results) => {
            return { recordType, results, records };
          });
        }
      });

      return Promise.all(upsertResults).then((results) => {
        return results.reduce((rr, r) => {
          if (r && r.recordType) {
            rr[r.recordType] = r;
          }
          return rr
        }, {});
      });
    });
  }
}
