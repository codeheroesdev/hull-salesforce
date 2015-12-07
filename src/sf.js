import { Promise } from 'es6-promise';
import { uniq } from 'lodash';

const RESERVED_CHARACTERS_REGEXP = /\?|\&|\||\!|\{|\}|\[|\]|\(|\)|\^|\~|\*|\:|\+|\-|\"|\'/ig;

function escapeSOSL(str) {
  return str.replace(RESERVED_CHARACTERS_REGEXP, (c) => "\\" + c);
}

export class SF {
  constructor(connection) {
    this.connection = connection;
  }

  upsert(type, data, key='Email') {
    const SObject = this.connection.sobject(type);
    return new Promise((resolve, reject)=> {
      SObject.upsert(data, key, (err, res)=> {
        err ? reject(err) : resolve(res);
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

    let ret = this.exec('search', qry).then((res) => {
      return res.reduce((m,o) => {
        m[o.Email] = m[o.Email] || {};
        m[o.Email][o.attributes.type] = o;
        return m;
      }, {});
    });

    return ret;
  }
}
