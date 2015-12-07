import assign from 'object-assign';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { createHmac } from 'crypto';
import Hull from 'hull';

export function config(env={}, options={}) {
  var defaults = {
    hull: {
      appId: env.HULL_APP_ID,
      orgUrl: env.HULL_ORG_URL,
      appSecret: env.HULL_APP_SECRET
    },
    salesforce: {
      login: env.SALESFORCE_LOGIN,
      password: env.SALESFORCE_PASSWORD,
      loginUrl: env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com'
    },
    sync: {
      fetchRange: '1h',
      batchSize: 100
    },
    mappings: {
      Lead: {
        type: 'Lead',
        fields: {
          LeadSource:     'main_identity',
          Description:    'description',
          Email:          'email',
          FirstName:      { key: 'first_name', defaultValue: '[Unknown]' },
          LastName:       { key: 'last_name', defaultValue: '[Unknown]' },
          Company:        { key: 'company', defaultValue: '[Unknown]' },
          Street:         { key: 'address_street' },
          City:           { key: 'address_city' },
          Country:        { key: 'address_country' },
          State:          { key: 'address_state' },
          PostalCode:     { key: 'address_postal_code' },
          Phone:          { key: 'phone' }
        }
      },
      Contact: {
        type: 'Contact',
        fields: {
          Email: 'email',
          FirstName: 'first_name',
          LastName: 'last_name'
        }
      }
    }
  };

  var cfg = {}, filename = options.f || env.CONFIG_FILE;

  if (filename) {
    cfg = JSON.parse(readFileSync(resolve(filename)));
  }


  return assign({}, defaults, cfg);
}

function generateShipSecret(shipId, secret) {
  return createHmac('sha256', secret)
          .update(shipId)
          .digest('hex');
}

function getHullClient(orgUrl, appId, appSecret) {
  return Hull.client({ orgUrl, appId, appSecret });
}


function buildConfigFromShip(ship, orgUrl, appSecret) {
  const {
    salesforce_login,
    salesforce_password,
    salesforce_login_url
  } = ship.private_settings;

  const mappings = ['Lead', 'Contact'].reduce((maps, type) => {
    const fieldsList = ship.private_settings[`${type.toLowerCase()}s_mapping`];
    if (fieldsList && fieldsList.length > 0) {
      const fields = fieldsList.reduce((ff, field) => {
        const f = { key: field.hull_field_name, overwrite: !!field.overwrite };
        if (field.default_value && field.default_value.length > 0) {
          f.defaultValue = field.default_value;
        }

        if (field.tpl && field.tpl.length > 0) {
          f.tpl = field.tpl;
        }

        ff[field.salesforce_field_name] = f;
        return ff;
      }, {});

      maps[type] = { type, fields };
    }

    return maps;
  }, {});

  return {
    hull: { orgUrl, appId: ship.id, appSecret },
    salesforce: {
      login: salesforce_login,
      password: salesforce_password,
      loginUrl: salesforce_login_url || 'https://login.salesforce.com'
    },
    sync: {
      fetchRange: '3d',
      batchSize: 100
    },
    mappings
  }
}


export function getShipConfig(orgUrl, appId, secret) {
  const appSecret = generateShipSecret(appId, secret);
  const hull = getHullClient(orgUrl, appId, appSecret);
  return new Promise((resolve, reject) => {
    hull.get(appId, (err, ship) => {
      if (err) return reject(err);
      resolve(buildConfigFromShip(ship, orgUrl, appSecret));
    })
  });
}

