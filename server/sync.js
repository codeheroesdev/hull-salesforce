import Hogan from "hogan.js";
import _ from "lodash";
export function syncRecords(sfObjectsByEmail, users, options) {
  return users.reduce((records, user) => {
    const sfObjects = sfObjectsByEmail[user.email] || {};

    // If a Contact with this email is known, let's update it, otherwise it's a Lead.
    const objectType = sfObjects.Contact ? "Contact" : "Lead";
    const mapping = options.mappings[objectType];

    if (mapping) {
      const record = getUpdatedFields(user, sfObjects[objectType], mapping);
      if (record) {
        records[objectType].push(record);
      }
    }

    return records;
  }, { Contact: [], Lead: [] });
}


export function getUpdatedFields(user, sfObject, mapping) {
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
        val = user[def];
      } else if (def.key) {
        val = _.get(user, def.key);
      } else if (def.tpl) {
        val = Hogan.compile(def.tpl).render(user);
      }

      if (defaultValue && (_.isNil(val) || val.length == 0)) {
        try {
          val = Hogan.compile(defaultValue).render(user);
        } catch (err) {
          val = defaultValue;
        }
      }

      if (!_.isNil(val) && (val !== orig)) mapped[f] = val;
    }

    return mapped;
  }, { Email: user.email });

  if (Object.keys(record).length > 1) {
    return record;
  }
}
