import { resolve } from 'path';
import { readFileSync } from 'fs';
import { createHmac } from 'crypto';
import Hull from 'hull';

export function config(env={}, options={}) {
  var defaults = {
    hostSecret: env.SECRET || "BOOM",
    hull: {
      id: env.HULL_APP_ID,
      organization: env.HULL_ORG_URL,
      secret: env.HULL_APP_SECRET
    },
    salesforce: {
      oauth2: {
        clientId : process.env.CLIENT_ID,
        clientSecret : process.env.CLIENT_SECRET
      }
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

function getHullClient(organization, id, secret) {
  return new Hull({ organization, id, secret });
}


export function buildConfigFromShip(ship, organization, secret) {

  const {
    access_token,
    refresh_token,
    instance_url,
    synchronized_segments
  } = ship.private_settings;

  const mappings = ['Lead', 'Contact'].reduce((maps, type) => {
    const fieldsList = ship.private_settings[`${type.toLowerCase()}s_mapping`];
    const fetchFields = ship.private_settings[`fetch_${type.toLowerCase()}_fields`] || [];
    maps[type] = { type, fetchFields, fields: {} };
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

      maps[type] = { type, fields, fetchFields };
    }

    return maps;
  }, {});

  return {
    hull: { organization, id: ship.id, secret },
    salesforce: {
      accessToken: access_token,
      refreshToken: refresh_token,
      instanceUrl: instance_url,
      oauth2: {
        clientId : process.env.CLIENT_ID,
        clientSecret : process.env.CLIENT_SECRET
      }
    },
    sync: {
      segmentIds: synchronized_segments || [],
      fetchRange: '3d',
      batchSize: 200
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

