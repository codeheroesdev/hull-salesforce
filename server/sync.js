import Hogan from "hogan.js";
import _ from "lodash";

// NOTE: exported for tests only
export function getUpdatedFields(user, sfObject, mapping, initialRecord) {
  const initialSize = Object.keys(initialRecord).length;
  const fields = mapping.fields;
  const fieldNames = Object.keys(fields);
  const record = fieldNames.reduce((mapped, f) => {
    let val;
    // orig: current value of the SF Object
    const orig = sfObject && sfObject[f];
    // def: Field Definition
    const def = fields[f];
    // Apply defaultValue only if orig is undefined
    const defaultValue = orig ? undefined : (def && def.defaultValue);

    if (orig === undefined || orig === null || orig === (def && def.defaultValue) || def.overwrite === true) {
      if (typeof (def) === "string") {
        const key = _.last(_.split(def, "."));
        val = user[key];
      } else if (def.key) {
        // Quick fix to handle accounts fields that are defined as `account.*`
        const key = _.last(_.split(def.key, "."));
        val = _.get(user, key);
      } else if (def.tpl) {
        val = Hogan.compile(def.tpl).render(user);
      }

      if (defaultValue && (_.isNil(val) || val.length === 0)) {
        try {
          val = Hogan.compile(defaultValue).render(user);
        } catch (err) {
          val = defaultValue;
        }
      }

      if (!_.isNil(val) && (val !== orig)) mapped[f] = val;
    }

    return mapped;
  }, initialRecord);

  if (Object.keys(record).length > initialSize) {
    return record;
  }
  return undefined;
}

export function syncUsers(sfObjectsByEmail, users, options) {
  return users.reduce((records, user) => {
    const sfObjects = sfObjectsByEmail[user.email] || {};

    // If a Contact with this email is known, let's update it, otherwise it's a Lead.
    const objectType = sfObjects.Contact ? "Contact" : "Lead";
    const mapping = options.mappings[objectType];

    if (mapping) {
      const record = getUpdatedFields(user, sfObjects[objectType], mapping, { Email: user.email });
      if (record) {
        records[objectType].push(record);
      }
    }

    return records;
  }, { Contact: [], Lead: [] });
}

/*
 * :param sfAccounts: object - Salesforce Account records by domain or id
 */
export function syncAccounts(sfAccounts, accounts, mapping) {
  return accounts.reduce((records, account) => {
    const sfAccount = sfAccounts[account.domain] || sfAccounts[account["salesforce/id"]] || {};

    const accountToUpsert = {};
    if (sfAccount.Id) {
      accountToUpsert.Id = sfAccount.Id;
    }

    const record = getUpdatedFields(account, sfAccount, mapping, accountToUpsert);

    if (record) {
      records.push(record);
    }

    return records;
  }, []);
}
