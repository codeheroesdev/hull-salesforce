import Hogan from 'hogan.js';
import { get } from 'lodash';
export function syncRecords(sfObjectsByEmail, users, options) {
  return users.reduce((records, user)=> {

    let sfObjects = sfObjectsByEmail[user.email] || {};

    // If a Contact with this email is known, let's update it, otherwise it's a Lead.

    let objectType = sfObjects.Contact ? 'Contact' : 'Lead';
    let mapping = options.mappings[objectType];

    if (mapping) {
      let record = getUpdatedFields(user, sfObjects[objectType], mapping);
      if (record) {
        records[objectType].push(record);
      }
    }

    return records;
  }, { Contact: [], Lead: [] });
}


export function getUpdatedFields(user, sfObject, mapping) {
  let fields = mapping.fields;
  let fieldNames = Object.keys(fields);

  let record = fieldNames.reduce((mapped, f) => {
    let val,
        // orig: current value of the SF Object
        orig = sfObject && sfObject[f],
        // def: Field Definition
        def = fields[f],
        // Apply defaultValue only if orig is undefined
        defaultValue = orig ? undefined : (def && def.defaultValue);

    if (orig === undefined || orig === null || orig === (def && def.defaultValue) || def.overwrite === true) {

      if (typeof(def) === 'string') {
        val = user[def];
      } else if (def.key) {
        val = get(user, def.key, defaultValue);
      } else if (def.tpl) {
        val = Hogan.compile(def.tpl).render(user);
      }

      if (val && (val !== orig)) mapped[f] = val;
    }

    return mapped;
  }, { Email: user.email });

  if (Object.keys(record).length > 1) {
    return record;
  }
}

