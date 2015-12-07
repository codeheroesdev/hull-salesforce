import Hull from 'hull';
import { SF } from './sf';
import { syncRecords } from './sync';
import { getShipConfig } from './config';
import { EventEmitter } from 'events';
import assign from 'object-assign';
import jsforce from 'jsforce';

function fetchQuery(sync) {
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

  static syncShip(orgUrl, shipId, secret) {
    return getShipConfig(orgUrl, shipId, secret).then( config => {
      return new Agent(config).sync();
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
    let connect = new Promise((resolve, reject)=> {
      // Salesforce
      let { login, password, loginUrl } = this.config.salesforce;
      var conn = new jsforce.Connection({ loginUrl : loginUrl });


      if (login && password) {
        conn.login(login, password, (err, userInfo)=> {
          if (err) {
            console.warn('Error', err);
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
      this.hull = Hull.client(this.config.hull);

    });

    connect.catch((err) => {
      console.log('Error establishing connection with Salesforce: ', err)
      return err;
    })

    this._connect = connect;
    return connect;
  }

  sync() {
    return this.connect().then(()=> {
      return this.startSync();
    }, (err)=> {
      this.emit('error', err)
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
    this._result.catch((err) => this.emit('error', err))
    return this._result;
  }

  fetchPage(pageNum) {
    let query = fetchQuery(this.config.sync);

    let per_page = this.config.per_page || 100;
    let params = { raw: true, page: pageNum, per_page, query };

    return new Promise((resolve, reject) => {
      this.hull.post('search/user_reports', params, (err, response) => {
        err ? reject(err) : resolve(response);
      })
    });
  }

  syncUsers(users, mappings) {
    let emails = users.map((u)=> u.email);
    let sfRecords = this.sf.searchEmails(emails, mappings);

    return sfRecords.then((searchResults)=> {
      let records = syncRecords(searchResults, users, { mappings });
      return ['Lead', 'Contact'].reduce((results, recordType) => {
        let data = records[recordType];

        if (data && data.length > 0) {
          results[recordType] = {
            records: data,
            results: this.sf.upsert(recordType, data)
          }
        }
        return results;
      }, {});

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
            let result = assign({ page: pageNum }, users, { records });
            this.emit('data', result);
            resolve(result);
          }, reject);
        }, reject);
      })
    }
    return page;
  }

}
