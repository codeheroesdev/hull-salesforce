import _ from "lodash";
import Promise from "bluebird";
import librato from "librato-node";

function increment(metric, value, options) {
  try {
    if (librato && librato.increment) {
      librato.increment(metric, value, options);
    }
  } catch (err) {
    // console.warn('Librato error', err)
  }
}

const RESERVED_CHARACTERS_REGEXP = /\?|&|\||!|\{|\}|\[|]|\(|\)|\^|~|\*|:|\+|-|"|'/ig;

function escapeSOSL(str) {
  return str.replace(RESERVED_CHARACTERS_REGEXP, c => `\\${c}`);
}

function searchFieldsQuery(field, emails, mappings) {
  const findEmails = emails.reduce((a, e) => {
    if (e && e.length > 3) {
      a.push(`"${escapeSOSL(e)}"`);
    }
    return a;
  }, []);

  const Returning = Object.keys(mappings).reduce((ret, type) => {
    const fieldsList = _.uniq(["Id"].concat(_.compact(Object.keys(mappings[type].fields || {}))));
    ret.push(`${type}(${fieldsList.join(",")})`);
    return ret;
  }, []);

  return `FIND {${findEmails.join(" OR ")}} IN ${field} FIELDS RETURNING ${Returning.join(", ")}`;
}

function searchEmailsQuery(emails, mappings) {
  return searchFieldsQuery("Email", emails, mappings);
}

function searchIdsQuery(ids, mappings) {
  return searchFieldsQuery("Id", ids, mappings);
}

const DEFAULT_FIELDS = {
  Account: ["Id", "Website"],
  User: ["Id", "Email", "FirstName", "LastName"]
};

const REQUIRED_FIELDS = {
  Account: ["Id"],
  User: ["Email"]
};


export default class SF {
  constructor(connection, hullClient) {
    this.connection = connection;
    this.logger = hullClient.logger;
  }

  upsert(type, input = [], externalIDFieldName = "Email") {
    return input.length > 99 ?
      this._upsertBulk(type, input, externalIDFieldName) :
      this._upsertSoap(type, input, externalIDFieldName);
  }

  _upsertSoap(type, input, externalIDFieldName = "Email") {
    return new Promise((resolve, reject) => {
      const message = {
        externalIDFieldName,
        sObjects: input.map((o) => {
          return { type, ...o };
        })
      };
      return this.connection.soap._invoke("upsert", message, false, (err, res) => {
        if (err) {
          increment("salesforce:errors", 1, { source: this.connection._shipId });
          this.logger.error("outgoing.user.error", {
            res, externalIDFieldName, input, errors: err, email: input[0].Email
          });
          reject(err);
        } else {
          this.logger.log("upsert success", JSON.stringify({ err, res, externalIDFieldName, input }));
          if (_.isArray(res)) {
            res.forEach((r, idx) => {
              const email = input[idx].Email;
              increment("salesforce:errors", 1, { source: this.connection._shipId });
              if (r.success !== "true") {
                this.logger.log("upsert error", { res: r, input: input[idx] });
                this.logger.error("outgoing.user.error", {
                  errors: r.errors,
                  email
                });
              } else {
                this.logger.info("outgoing.user.success", { email });
              }
            });
          } else {
            this.logger.info("outgoing.user.success", { email: input[0].Email });
          }
          resolve(res);
        }
      });
    });
  }

  _upsertBulk(type, input = [], extIdField = "Email") {
    const SObject = this.connection.sobject(type);
    const bulkId = _.uniqueId(`bulk-${type}-`);
    this.logger.info("upsert.start", { bulkId, type, records: input.length });
    return new Promise((resolve, reject) => {
      return SObject.upsertBulk(input, extIdField, (err, res) => {
        if (err) {
          increment("salesforce:errors", 1, { source: this.connection._shipId });
          this.logger.error("outgoing.user.error", {
            bulkId, res, extIdField, input, errors: err, email: input[0].Email
          });
          reject(err);
        } else {
          const stats = { success: 0, error: 0 };
          if (_.isArray(res)) {
            res.forEach((r, idx) => {
              const email = input[idx].Email;
              if (r.success.toString() !== "true") {
                stats.error += 1;
                increment("salesforce:errors", 1, { source: this.connection._shipId });
                this.logger.error("outgoing.user.error", { bulkId, email, errors: r.errors });
              } else {
                stats.success += 1;
                this.logger.info("outgoing.user.success", { bulkId, email });
              }
            });
          } else {
            this.logger.info("upsert.debug", { res });
          }
          this.logger.info("upsert.done", { bulkId, type, records: input.length, ...stats });
          resolve(res);
        }
      });
    });
  }

  getFieldsList(type) {
    return this.exec("describe", type).then((meta) => {
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
    const defaultFields = DEFAULT_FIELDS[type];
    const requiredField = REQUIRED_FIELDS[type];
    const fieldsList = (options && options.fields && options.fields.length > 0) ? Promise.resolve(options.fields) : this.getFieldsList(type).then(_.keys);
    return fieldsList.then((fields) => {
      const selectFields = _.uniq(fields.concat(defaultFields)).join(",");
      const idsList = ids.map(f => `'${f}'`).join(",");
      const query = `SELECT ${selectFields} FROM ${type} WHERE Id IN (${idsList}) AND ${requiredField} != null`;
      return this.exec("query", query).then(({ records }) => records);
    });
  }

  getAllRecords({ type, fields = [] }, onRecord) {
    // Default fields for Leads and Contacts
    const defaultFields = DEFAULT_FIELDS[type];
    const requiredField = REQUIRED_FIELDS[type];
    const selectFields = _.uniq(fields.concat(defaultFields)).join(",");
    return new Promise((resolve, reject) => {
      const soql = `SELECT ${selectFields} FROM ${type} WHERE ${requiredField} != null`;
      const query = this.connection.query(soql)
        .on("record", onRecord)
        .on("end", () => {
          resolve({ query, type, fields });
        })
        .on("error", (err) => {
          reject(err);
        })
        .run({ autoFetch: true });
    });
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
            reject(err);
          } else if (res.ids && res.ids.length > 0) {
            const chunks = _.chunk(res.ids, 100).map(
              ids => this.getRecordsByIds(type, ids, { fields })
            );

            Promise.all(chunks)
              .then(_.flatten)
              .then((records) => {
                resolve({ type, fields, records });
                if (records && records.length) {
                  increment("salesforce:updated_records", records.length, { source: this.connection._shipId });
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

  exec(fn, ...args) {
    return new Promise((resolve, reject) => {
      this.connection[fn].apply(this.connection, [...args, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      }]);
    });
  }

  searchEmails(emails = [], mappings) {
    if (emails.length === 0) return Promise.resolve({});

    const chunks = _.chunk(emails, 100);
    const searches = chunks.map(
      chunk => this.exec("search", searchEmailsQuery(chunk, mappings))
    );

    return Promise.all(searches).then((results) => {
      return results.reduce((recs, { searchRecords = [] }) => {
        searchRecords.forEach((o) => {
          recs[o.Email] = recs[o.Email] || {};
          recs[o.Email][o.attributes.type] = o;
        });
        return recs;
      }, {});
    });
  }

  searchIds(ids = [], mappings) {
    if (ids.length === 0) return Promise.resolve({});

    const chunks = _.chunk(ids, 100);
    const searches = chunks.map(
      chunk => this.exec("search", searchIdsQuery(chunk, mappings))
    );

    return Promise.all(searches).then((results) => {
      return results.reduce((recs, { searchRecords = [] }) => {
        searchRecords.forEach((o) => {
          recs[o.Id] = recs[o.Id] || {};
          recs[o.Id][o.attributes.type] = o;
        });
        return recs;
      }, {});
    });
  }
}
