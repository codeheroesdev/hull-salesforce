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

function fetchQuery(sync) {
  // TODO add support for segmentId filtering
  return {
    filtered: {
      query: { match_all: {} },
      filter: {
        and: {
          filters: [
            { range: { last_seen_at: { gt: "now-" + (sync.fetchRange || '1h') } } },
            { exists: { field: 'email' } }
          ]
        }
      }
    }
  }
};

export class Agent extends EventEmitter {

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
    if (matchingUsers.length > 0) {
      if (agent.shouldSync(matchingUsers, ship)) {
        return agent.connect().then(() => {
          return agent.syncUsers(matchingUsers.map(u => u.user));
        });
      }
    }
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

  startSync() {
    if (this._result) return this._result;
    this._result = new Promise((resolve, reject) => {
      var stats = { fetched: 0, updated: { total: 0 }, pages: 0 };
      this.on('data', (res)=> {
        stats.pages = res.page;
        stats.fetched += res.data.length;
        Object.keys(res.records).map((k) => {
          stats.updated[k] = stats.updated[k] || 0;
          stats.updated.total += (res.records[k].records || []).length
          stats.updated[k] += (res.records[k].records || []).length
        })
        if (res.page < res.pagination.pages) {
          let nextPage = res.page + 1;
          this.syncPage(nextPage).catch(reject);
          this.status = 'sync';
        } else {
          this.status = 'finished';
          this.emit('end', stats);
          resolve(stats);
        }
      });
      this.syncPage(1).catch(reject);
    });

    this._result.catch((err) => {
      this.emit('error', err)
    })
    return this._result;
  }

  fetchPage(pageNum) {
    let query = fetchQuery(this.config.sync);

    let per_page = this.config.per_page || 100;
    let params = { raw: true, page: pageNum, per_page, query };

    return this.hull.post('search/user_reports', params);
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

  syncPage(pageNum) {
    let mappings = this.config.mappings;
    let page = this.pages[pageNum];
    if (!page) {
      page = this.pages[pageNum] = new Promise((resolve, reject) => {
        this.fetchPage(pageNum).then((users)=> {
          this.emit('fetch', users);
          this.syncUsers(users.data, mappings).then((records)=> {
            const result = {
              page: pageNum,
              ...users,
              records: records
            }
            this.emit('data', result);
            resolve(result);
          }, reject);
        }, reject);
      })
    }
    return page;
  }

}
