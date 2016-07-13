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

export default class Agent extends EventEmitter {

  static sync(config) {
    return new Agent(config).sync();
  }

  static syncShip(organization, id, secret) {
    return getShipConfig(organization, id, secret).then(config => {
      return new Agent(config).sync();
    });
  }

  static syncUsers(hull, ship, users) {
    const { organization, secret } = hull.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);
    const matchingUsers = agent.getUsersMatchingSegment(users);
    let result = Promise.resolve({});
    if (matchingUsers.length > 0) {
      if (agent.shouldSync(matchingUsers, ship)) {
        result = agent.connect().then(() => {
          return agent.syncUsers(matchingUsers.map(u => u.user));
        });
      }
    }
    return result;
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

  getUsersMatchingSegment(users) {
    const { segmentId } = this.config.sync || {};
    if (!segmentId) return users;
    return users.filter((user) => {
      const ids = (user.segments || []).map(s => s.id);
      return ids.includes(segmentId);
    });
  }

  shouldSync(users, ship) {
    try {
      const { leads_mapping, contacts_mapping } = ship.private_settings || {};

      const mappings = [].concat(leads_mapping || {}).concat(contacts_mapping);
      const mappedKeys = _.uniq(_.compact(mappings.map(m => {
        const { hull_field_name } = m;
        if (hull_field_name && hull_field_name.length) {
          return hull_field_name;
        }
      })));

      const templates = _.uniq(_.compact(mappings.map(m => {
        const { tpl } = m;
        if (tpl && tpl.length) {
          return tpl;
        }
      })));

      const changedKeys = users.reduce((keys, user) => {
        const changes = Object.keys((user.changes || {}).user || {});
        return _.uniq(keys.concat(changes))
      }, []);

      const changed = _.intersection(changedKeys, mappedKeys).length > 0;
      const templated = _.some(templates,  tpl => {
        return _.some(changedKeys, k => tpl.includes(k))
      }, false);

      return changed || templated;
    } catch (err) {
      console.warn('Error in shouldSync', err);
      return false;
    }
  }

  sync() {
    return this.connect().then(()=> {
      return this.startSync();
    }, (err)=> {
      this.emit('error', err);
      return err;
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
