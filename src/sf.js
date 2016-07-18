import { uniq } from 'lodash';

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
    return input.length > 200 ?
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
          log('upsert error', JSON.stringify({ err, res, externalIDFieldName, input }));
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }

  _upsertBulk(type, input, extIdField='Email') {
    const SObject = this.connection.sobject(type);
    log('upsert', JSON.stringify({ type, input }));
    return new Promise((resolve, reject)=> {
      return SObject.upsertBulk(input, extIdField, (err, res)=> {
        if (err) {
          console.log('upsert error', JSON.stringify({ err, res, extIdField, input }));
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }

  searchEmailsQuery(emails, mappings) {
    let findEmails = emails.reduce((a, e) => {
      e && e.length > 3 && a.push('"' + escapeSOSL(e) + '"');
      return a;
    }, []);

    let Returning = Object.keys(mappings).reduce((ret,type)=> {
      let fieldsList = uniq(['Id'].concat(Object.keys(mappings[type].fields || {})));
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

  searchEmails(emails, mappings) {

    if (emails.length === 0) return Promise.resolve({});

    let qry = this.searchEmailsQuery(emails, mappings);

    let ret = this.exec('search', qry).then(({ searchRecords = [] }) => {
      return searchRecords.reduce((m,o) => {
        m[o.Email] = m[o.Email] || {};
        m[o.Email][o.attributes.type] = o;
        return m;
      }, {});
    });

    return ret;
  }
}
