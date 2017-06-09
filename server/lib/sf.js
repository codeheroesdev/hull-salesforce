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

export function searchQuery(field, emails, mappings) {
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
  const qry = `FIND {${findEmails.join(" OR ")}} IN ${field} FIELDS RETURNING ${Returning.join(", ")}`;

  return qry;
}

export function getMatchingPattern(s, patterns) {
  let result = null;
  patterns.some((pattern) => {
    if (s.match(pattern)) {
      result = pattern;
      return true;
    }
    return false;
  });
  return result;
}

function getDefaultFields(type) {
  switch (type) {
    case "Account":
      return ["Id", "Website"];
    case "Contact":
      return ["Id", "Email", "FirstName", "LastName", "Account.Website"];
    case "Lead":
      return ["Id", "Email", "FirstName", "LastName"];
    default:
      return ["Id"];
  }
}

function getRequiredField(type) {
  switch (type) {
    case "Account":
      return "Website";
    default:
      return "Email";
  }
}

function getAllRecordsSoqlQuery(type, fields) {
  const defaultFields = getDefaultFields(type);
  const requiredField = getRequiredField(type);
  const selectFields = _.uniq(fields.concat(defaultFields)).join(",");

  return `SELECT ${selectFields} FROM ${type} WHERE ${requiredField} != null`;
}

export default class SF {
  constructor(connection, logger) {
    this.connection = connection;
    this.logger = logger;
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

          let errors = err;

          if (err && err.errorCode === "soapenv:Client") {
            errors = err.toString();
          }

          this.logger.error("outgoing.user.error", {
            errors,
            message: err && err.message,
            email: input[0].Email,
            log_placement: "_upsertSoap.1"
          });

          reject(err);
        } else {
          if (_.isArray(res)) {
            res.forEach((r, idx) => {
              increment("salesforce:errors", 1, { source: this.connection._shipId });
              if (r.success !== "true") {
                this.logger.error("outgoing.user.error", {
                  errors: r.errors,
                  email: input[idx].Email,
                  log_placement: "_upsertSoap.2"
                });
              } else {
                this.logger.info("outgoing.user.success", {
                  email: input[idx].Email,
                  log_placement: "_upsertSoap.3"
                });
              }
            });
          } else if (res.success !== "true" || res.errors) {
            this.logger.error("outgoing.user.error", {
              errors: res.errors,
              email: input[0].Email,
              log_placement: "_upsertSoap.4"
            });
          } else {
            this.logger.info("outgoing.user.success", {
              email: input[0].Email,
              log_placement: "_upsertSoap.5"
            });
          }
          resolve(res);
        }
      });
    });
  }

  _upsertBulk(type, input = [], extIdField = "Email") {
    const SObject = this.connection.sobject(type);
    this.logger.log("upsert", JSON.stringify({ type, records: input.length }));
    return new Promise((resolve, reject) => {
      return SObject.upsertBulk(input, extIdField, (err, res) => {
        if (err) {
          this.logger.error("outgoing.user.error", {
            email: input[0].Email,
            errors: err,
            message: err.message,
            log_placement: "_upsertBulk.1"
          });
          reject(err);
        } else {
          if (_.isArray(res)) {
            res.forEach((r, idx) => {
              increment("salesforce:errors", 1, { source: this.connection._shipId });
              if (r.success.toString() !== "true") {
                this.logger.error("outgoing.user.error", {
                  email: input[idx].Email,
                  errors: r.errors,
                  log_placement: "_upsertBulk.2"
                });
              } else {
                this.logger.info("outgoing.user.success", {
                  email: input[idx].Email,
                  log_placement: "_upsertBulk.3"
                });
              }
            });
          } else if (res.success.toString() !== "true" || res.errors) {
            this.logger.error("outgoing.user.error", {
              errors: res.errors,
              email: input[0].Email,
              log_placement: "_upsertBulk.4"
            });
          } else {
            this.logger.info("outgoing.user.success", {
              email: input[0].Email,
              log_placement: "_upsertBulk.5"
            });
          }
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
    const defaultFields = getDefaultFields(type);
    const requiredField = getRequiredField(type);
    const fieldsList = (options && options.fields && options.fields.length > 0) ? Promise.resolve(options.fields) : this.getFieldsList(type).then(_.keys);
    return fieldsList.then((fields) => {
      const selectFields = _.uniq(fields.concat(defaultFields)).join(",");
      const idsList = ids.map(f => `'${f}'`).join(",");
      const query = `SELECT ${selectFields} FROM ${type} WHERE Id IN (${idsList}) AND ${requiredField} != null`;
      return this.exec("query", query).then(({ records }) => records);
    });
  }

  getAllRecords({ type, fields = [] }, onRecord) {
    return new Promise((resolve, reject) => {
      const soql = getAllRecordsSoqlQuery(type, fields);
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
            return reject(err);
          }
          if (res.ids && res.ids.length > 0) {
            const chunks = _.chunk(res.ids, 100)
              .map(ids => this.getRecordsByIds(type, ids, { fields }));

            return Promise.all(chunks)
              .then(_.flatten)
              .then((records) => {
                resolve(records);
                if (records && records.length) {
                  increment("salesforce:updated_records", records.length, { source: this.connection._shipId });
                }
              })
              .catch(reject);
          }
          return resolve([]);
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

  searchEmails(emails, mappings) {
    if (emails.length === 0) return Promise.resolve({});

    const chunks = _.chunk(emails, 100);
    const searches = chunks.map(
      chunk => this.exec("search", searchQuery("EMAIL", chunk, mappings))
    );

    return Promise.all(searches).then((results) => {
      return results.reduce((recs, { searchRecords = [] }) => {
        searchRecords.forEach((record) => {
          recs[record.Email] = recs[record.Email] || {};
          recs[record.Email][record.attributes.type] = record;
        });
        return recs;
      }, {});
    });
  }

  searchDomains(domains = [], mappings) {
    if (domains.length === 0) return Promise.resolve({});

    const chunks = _.chunk(domains, 100);
    const searches = chunks.map(
      chunk => this.exec("search", searchQuery("NAME", chunk, mappings))
    );

    return Promise.all(searches).then((results) => {
      return results.reduce((recs, { searchRecords = [] }) => {
        searchRecords.forEach((record) => {
          if (record.attributes.type === "Account") {
            // TODO: Add resolution strategy in case several sf records match the domain
            const domain = getMatchingPattern(record.Website, domains);
            if (domain) {
              recs[domain] = record;
            }
          }
        });
        return recs;
      }, {});
    });
  }
}
