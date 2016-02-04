import { resolve } from 'path';
import { readFileSync } from 'fs';
import { createHmac } from 'crypto';
import Hull from 'hull';

export function config(env={}, options={}) {
  var defaults = {
    hull: {
      platformId: env.HULL_APP_ID,
      orgUrl: env.HULL_ORG_URL,
      platformSecret: env.HULL_APP_SECRET
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

  return {
    ...defaults,
    ...cfg
  };
}

function generateShipSecret(shipId, secret) {
  return createHmac('sha256', secret)
          .update(shipId)
          .digest('hex');
}

function getHullClient(orgUrl, platformId, platformSecret) {
  return new Hull({ orgUrl, platformId, platformSecret });
}


export function buildConfigFromShip(ship, orgUrl, platformSecret) {

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
    hull: { orgUrl, platformId: ship.id, platformSecret },
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


export function getShipConfig(orgUrl, shipId, secret) {
  const appSecret = secret || generateShipSecret(shipId, process.env.SECRET);
  const hull = getHullClient(orgUrl, shipId, appSecret);
  return hull.get(shipId).then(ship => {
    if (!ship.private_settings) {
      throw new Error("Invalid hull credentials");
    }
    return buildConfigFromShip(ship, orgUrl, appSecret);
  });
}

