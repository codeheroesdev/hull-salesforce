import _ from 'lodash';
import Promise from 'bluebird';

import librato from 'librato-node';

function increment(metric, value, options) {
  try {
    if (librato && librato.increment) {
      librato.increment(metric, value, options);
    }
  } catch(err) {
    // console.warn('Librato error', err)
  }
}

const RESERVED_CHARACTERS_REGEXP = /\?|\&|\||\!|\{|\}|\[|\]|\(|\)|\^|\~|\*|\:|\+|\-|\"|\'/ig;

function escapeSOSL(str) {
  return str.replace(RESERVED_CHARACTERS_REGEXP, (c) => "\\" + c);
}

function log(a,b,c) {
  if (process.env.DEBUG) {
    console.log(a,b,c)
  }
}


export class SF {
  constructor(connection) {
    this.connection = connection;
  }

  upsert(type, input, externalIDFieldName='Email') {
    return input.length > 99 ?
      this._upsertBulk(type, input, externalIDFieldName) :
      this._upsertSoap(type, input, externalIDFieldName);
  }

  _upsertSoap(type, input, externalIDFieldName='Email') {
    return new Promise((resolve, reject)=> {
      const message = {
        externalIDFieldName,
        sObjects: input.map(o => {
          return { type, ...o }
        })
      };
      return this.connection.soap._invoke('upsert', message, false, (err, res) => {
        if (err) {
          increment('salesforce:errors', 1, { source: this.connection._shipId });
          log('upsert error', JSON.stringify({ err, res, externalIDFieldName, input }));
          reject(err);
        } else {
          console.log("upsert success", JSON.stringify({ err, res, externalIDFieldName, input }));
          if (_.isArray(res)) {
            res.map((r,idx) => {
              increment('salesforce:errors', 1, { source: this.connection._shipId });
              if (r.success !== 'true') {
                console.log('upsert error', JSON.stringify({ res: r, input: input[idx] }));
              }
            });
          }
          resolve(res);
        }
      });
    });
  }

  _upsertBulk(type, input = [], extIdField='Email') {
    const SObject = this.connection.sobject(type);
    log('upsert', JSON.stringify({ type, records: input.length }));
    return new Promise((resolve, reject)=> {
      return SObject.upsertBulk(input, extIdField, (err, res)=> {
        if (err) {
          console.log('upsert error', JSON.stringify({ err, res, extIdField, input }));
          reject(err);
        } else {
          if (_.isArray(res)) {
            res.map((r,idx) => {
              increment('salesforce:errors', 1, { source: this.connection._shipId });
              if (r.success.toString() !== 'true') {
                console.log('bulk upsert error', JSON.stringify({ res: r, input: input[idx] }));
              }
            });
          }
          resolve(res);
        }
      });
    });
  }

  getFieldsList(type) {
    return this.exec('describe', type).then(meta => {
      const keys = [];
      return meta.fields.reduce((fields, f) => {
        return { ...fields, [f.name]: f };
      }, {});
    });
  }

  /**
  * Fetch all records of a given type by ID
  *
  */
  getRecordsByIds(type, ids, options = {}) {
    const fieldsList = (options && options.fields && options.fields.length > 0) ? Promise.resolve(options.fields) : this.getFieldsList(type).then(_.keys);
    return fieldsList.then((fields) => {
      const selectFields = _.uniq(fields.concat(['Id', 'Email', 'FirstName', 'LastName'])).join(',');
      const idsList = ids.map(f => `'${f}'`).join(',');
      const query = `SELECT ${selectFields} FROM ${type} WHERE Id IN (${idsList}) AND Email != null`;
      return this.exec('query', query).then(({ records }) => records );
    });
  }

  getAllRecords({ type, fields = [] }, onRecord) {
    const selectFields = _.uniq(fields.concat(['Id', 'Email', 'FirstName', 'LastName'])).join(',');
    return new Promise((resolve, reject) => {
      const soql = `SELECT ${selectFields} FROM ${type} WHERE Email != null`;
      const query = this.connection.query(soql)
        .on("record", onRecord)
        .on("end", () => {
          resolve({ query, type, fields });
        })
        .on("error", function(err) {
          reject(err);
        })
        .run({ autoFetch : true });
    })
  }

  getUpdatedRecords(type, options = {}) {
    const fields = options.fields || [];
    const since = options.since ? new Date(options.since) : new Date(new Date().getTime() - (3600 * 1000));
    const until = options.until ? new Date(options.until) : new Date();
    return new Promise((resolve, reject) => {
      return this.connection.sobject(type).updated(
        since.toISOString(),
        until.toISOString(),
        (err, res = {}) => {
          if (err) {
            return reject(err);
          }
          if (res.ids && res.ids.length > 0)  {
            const chunks = _.chunk(res.ids, 100)
              .map((ids) => this.getRecordsByIds(type, ids, { fields }));

            Promise.all(chunks)
              .then(_.flatten)
              .then(records => {
                resolve({ type, fields, records })
                if (records && records.length) {
                  increment('salesforce:updated_records', records.length, { source: this.connection._shipId });
                }
              })
              .catch(reject);
          } else {
            resolve({ type, fields, records: [] });
          }
        }
      );
    });
  }

  searchEmailsQuery(emails, mappings) {
    let findEmails = emails.reduce((a, e) => {
      e && e.length > 3 && a.push('"' + escapeSOSL(e) + '"');
      return a;
    }, []);

    let Returning = Object.keys(mappings).reduce((ret,type)=> {
      let fieldsList = _.uniq(['Id'].concat(Object.keys(mappings[type].fields || {})));
      ret.push(`${type}(${fieldsList.join(',')})`)
      return ret;
    }, []);
    let qry = `FIND {${findEmails.join(' OR ')}} IN Email FIELDS RETURNING ${Returning.join(', ')}`;

    return qry;
  }

  exec(fn) {
    let args = [].slice.call(arguments, 1);
    return new Promise((resolve, reject)=> {
      this.connection[fn].apply(this.connection, [...args, (err, res) => {
        err ? reject(err) : resolve(res);
      }]);
    });
  }

  searchEmails(emails = [], mappings) {
    if (emails.length === 0) return Promise.resolve({});

    const chunks = _.chunk(emails, 100);
    const searches = chunks.map(
      chunk => this.exec('search', this.searchEmailsQuery(chunk, mappings))
    );

    return Promise.all(searches).then(results => {
      return results.reduce((recs, { searchRecords = [] }) => {
        searchRecords.map(o => {
          recs[o.Email] = recs[o.Email] || {};
          recs[o.Email][o.attributes.type] = o;
        })
        return recs;
      }, {});
    });

  }
}
