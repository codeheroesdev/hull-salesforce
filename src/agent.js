import _ from 'lodash';
import Hull from 'hull';
import { SF } from './sf';
import { syncRecords } from './sync';
import Connection from './connection';
import { getShipConfig, buildConfigFromShip } from './config';
import { EventEmitter } from 'events';
import jsforce from 'jsforce';

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

  static fetchChanges(hull, ship, options = {}) {
    const { organization, secret } = hull.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);
    return agent.connect().then(() => {
      return agent.fetchChanges(options);
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
    // Configure with Salesforce and Hull credentials

    this.on('error', (err) => {
      console.warn('Sync Error ', err);
    });

    let connect = new Promise((resolve, reject)=> {
      // Salesforce
      let { login, password, loginUrl } = this.config.salesforce;
      var conn = new Connection({ loginUrl : loginUrl });
      conn.setShipId(this.config.hull.id);
      if (login && password) {
        conn.login(login, password, (err, userInfo)=> {
          if (err) {
            this.emit('error', err);
            reject(err);
          } else {
            this.emit('connect', userInfo);
            this.sf = new SF(conn);
            this.userInfo = userInfo;
            resolve(conn);
          }
        });
      } else {
        reject(new Error('Salesforce credentials missing'));
      }

      // Hull
      this.hull = new Hull(this.config.hull);

    });

    connect.catch((err) => {
      console.log('Error establishing connection with Salesforce: for ', login, err)
      return err;
    })

    this._connect = connect;
    return connect;
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


  fetchChanges(options = {}) {
    const { mappings } = this.config;
    return Promise.all(_.map(mappings, ({ type }) => {
      return this.sf.getUpdatedRecords(type, options);
    })).then(changes => {
      changes.map(({ type, records }) => {
        records.map(rec => {
          const source = `salesforce_${type.toLowerCase()}`;
          const traits = _.reduce(rec, (t,v,k) => {
            return { ...t, [toUnderscore(k)]: v };
          }, {});
          return this.hull
            .as({ email: traits.email })
            .traits(traits, { source });
        });
      });
      return { changes };
    });
  }

  syncUsers(users) {
    const mappings = this.config.mappings;
    let emails = users.map((u)=> u.email);
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
