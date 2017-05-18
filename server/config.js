import _ from "lodash";
import { createHmac } from "crypto";
import Hull from "hull";
import { getTypes, getServiceAttributeToHullTopLevel, getServiceAttributeToHullTrait } from "./mapping-data";

function generateShipSecret(shipId, secret) {
  return createHmac("sha256", secret)
          .update(shipId)
          .digest("hex");
}

function getHullClient(organization, id, secret) {
  return new Hull({ organization, id, secret });
}

function getFieldsMapping(ship, type) {
  const fieldsList = ship.private_settings[`${type.toLowerCase()}s_mapping`];
  // Fetch all default salesforce attributes
  const defaultServiceAttributesToHullTrait = getServiceAttributeToHullTrait(type);
  const defaultServiceAttributesToHullTopLevel = getServiceAttributeToHullTopLevel(type);
  // Fetch custom salesforce attributes defined
  const settingsServiceAttributesToHullTrait = (ship.private_settings[`fetch_${type.toLowerCase()}_fields`] || [])
    .reduce(function setNullValue(result, field) {
      // Do not map custom attributes to hull top level properties
      result[field] = null;
      return result;
    }, {});

  const fetchFields = _.merge(defaultServiceAttributesToHullTrait, settingsServiceAttributesToHullTrait);

  const fields = {};
  if (fieldsList && fieldsList.length > 0) {
    fieldsList.forEach((field) => {
      const f = { key: field.hull_field_name, overwrite: !!field.overwrite };
      if (field.default_value && field.default_value.length > 0) {
        f.defaultValue = field.default_value;
      }

      if (field.tpl && field.tpl.length > 0) {
        f.tpl = field.tpl;
      }

      fields[field.salesforce_field_name] = f;
    });
  }

  return { type, fetchFields, fields, fetchFieldsToTopLevel: defaultServiceAttributesToHullTopLevel };
}

export function buildConfigFromShip(ship, organization, secret) {
  const {
    access_token,
    refresh_token,
    instance_url,
    synchronized_user_segments,
    synchronized_account_segments,
    fetch_accounts,
    salesforce_login,
    salesforce_password,
    salesforce_login_url
  } = ship.private_settings;

  const mappings = getTypes().reduce((memo, type) => {
    memo[type] = getFieldsMapping(ship, type);
    return memo;
  }, {});

  let credentials = {};

  if (access_token && instance_url) {
    credentials = {
      accessToken: access_token,
      refreshToken: refresh_token,
      instanceUrl: instance_url
    };
  } else if (salesforce_login && salesforce_password) {
    credentials = {
      login: salesforce_login,
      password: salesforce_password,
      loginUrl: salesforce_login_url
    };
  }

  const oauth2 = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET
  };

  return {
    hull: { organization, id: ship.id, secret },
    settings: { fetch_accounts },
    salesforce: { ...credentials, oauth2 },
    sync: {
      userSegmentIds: synchronized_user_segments || [],
      accountSegmentIds: synchronized_account_segments || [],
      fetchRange: "3d",
      batchSize: 200
    },
    mappings
  };
}

export function getShipConfig(orgUrl, shipId, secret) {
  const appSecret = secret || generateShipSecret(shipId, process.env.SECRET);
  const hull = getHullClient(orgUrl, shipId, appSecret);
  return hull.get(shipId).then((ship) => {
    if (!ship.private_settings) {
      throw new Error("Invalid hull credentials");
    }
    return buildConfigFromShip(ship, orgUrl, appSecret);
  });
}
