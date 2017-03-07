import _ from "lodash";

const DEFAULT_MAPPING = {
  Lead: [
    { service_attribute: "Email", hull_top_level_trait: null, hull_trait: "email", type: "string" },
    // { service_attribute: "HasOptedOutOfEmail", hull_top_level_trait: "accepts_marketing", hull_trait: "has_opted_out_of_email", type: "bool" }, // No such column 'HasOptedOutOfEmail' on entity 'Lead'
    { service_attribute: "FirstName", hull_top_level_trait: "first_name", hull_trait: "first_name", type: "string" },
    { service_attribute: "LastName", hull_top_level_trait: "last_name", hull_trait: "last_name", type: "string" },
    { service_attribute: "Name", hull_top_level_trait: null, hull_trait: "name", type: "string" },
    // { service_attribute: "Suffix", hull_top_level_trait: null, hull_trait: "suffix", type: "string" }, //No such column 'Suffix' on entity 'Lead'
    { service_attribute: "IsConverted", hull_top_level_trait: null, hull_trait: "is_converted", type: "bool" },
    { service_attribute: "Salutation", hull_top_level_trait: "salutation", hull_trait: "salutation", type: "string" },
    { service_attribute: "Title", hull_top_level_trait: "title", hull_trait: "title", type: "string" },
    { service_attribute: "Company", hull_top_level_trait: null, hull_trait: "company", type: "string" },
    { service_attribute: "Industry", hull_top_level_trait: null, hull_trait: "industry", type: "string" },
    { service_attribute: "Phone", hull_top_level_trait: "phone", hull_trait: "phone", type: "string" },
    { service_attribute: "MobilePhone", hull_top_level_trait: "mobile_phone", hull_trait: "mobile_phone", type: "string" },
    { service_attribute: "Fax", hull_top_level_trait: "fax", hull_trait: "fax", type: "string" },
    { service_attribute: "CreatedDate", hull_top_level_trait: null, hull_trait: "created_at", type: "string" },

    // LastModifiedDate || SystemModstamp || LastActivityDate
    { service_attribute: "LastModifiedDate", hull_top_level_trait: null, hull_trait: "last_modified_date", type: "string" },
    { service_attribute: "SystemModstamp", hull_top_level_trait: null, hull_trait: "system_modstamp", type: "string" },
    { service_attribute: "LastActivityDate", hull_top_level_trait: null, hull_trait: "last_activity_date", type: "string" },

    { service_attribute: "ConvertedDate", hull_top_level_trait: null, hull_trait: "converted_at", type: "string" },
    { service_attribute: "City", hull_top_level_trait: "city", hull_trait: "city", type: "string" },
    { service_attribute: "PostalCode", hull_top_level_trait: "postal_code", hull_trait: "postal_code", type: "string" },
    { service_attribute: "State", hull_top_level_trait: "state", hull_trait: "state", type: "string" },
    { service_attribute: "Country", hull_top_level_trait: "country", hull_trait: "country", type: "string" },
    // { service_attribute: "MiddleName", hull_top_level_trait: null, hull_trait: "middle_name", type: "string" }, // No such column 'MiddleName' on entity 'Lead'
    { service_attribute: "Industry", hull_top_level_trait: null, hull_trait: "industry", type: "string" },
    // { service_attribute: "CountryCode", hull_top_level_trait: null, hull_trait: "country_code", type: "string" }, // No such column 'CountryCode' on entity 'Lead'
    { service_attribute: "AnnualRevenue", hull_top_level_trait: null, hull_trait: "annual_revenue", type: "string" },
    { service_attribute: "Website", hull_top_level_trait: "website", hull_trait: "website", type: "string" },
    { service_attribute: "Id", hull_top_level_trait: null, hull_trait: "id", type: "string" },
    { service_attribute: "OwnerId", hull_top_level_trait: null, hull_trait: "owner_id", type: "string" }
  ],
  Contact: [
    { service_attribute: "Email", hull_top_level_trait: null, hull_trait: "email", type: "string" },
    // { service_attribute: "HasOptedOutOfEmail", hull_top_level_trait: "accepts_marketing", hull_trait: "has_opted_out_of_email", type: "bool" }, // No such column 'HasOptedOutOfEmail' on entity 'Contact'
    { service_attribute: "FirstName", hull_top_level_trait: "first_name", hull_trait: "first_name", type: "string" },
    { service_attribute: "LastName", hull_top_level_trait: "last_name", hull_trait: "last_name", type: "string" },
    { service_attribute: "Name", hull_top_level_trait: null, hull_trait: "name", type: "string" },
    // { service_attribute: "Suffix", hull_top_level_trait: null, hull_trait: "suffix", type: "string" }, // No such column 'Suffix' on entity 'Contact'
    { service_attribute: "Salutation", hull_top_level_trait: "salutation", hull_trait: "salutation", type: "string" },
    { service_attribute: "Title", hull_top_level_trait: "title", hull_trait: "title", type: "string" },
    { service_attribute: "Phone", hull_top_level_trait: "phone", hull_trait: "phone", type: "string" },
    { service_attribute: "MobilePhone", hull_top_level_trait: "mobile_phone", hull_trait: "mobile_phone", type: "string" },

    // LastModifiedDate || SystemModstamp || LastActivityDate
    { service_attribute: "LastModifiedDate", hull_top_level_trait: null, hull_trait: "last_modified_date", type: "string" },
    { service_attribute: "SystemModstamp", hull_top_level_trait: null, hull_trait: "system_modstamp", type: "string" },
    { service_attribute: "LastActivityDate", hull_top_level_trait: null, hull_trait: "last_activity_date", type: "string" },

    { service_attribute: "MailingStreet", hull_top_level_trait: "street", hull_trait: "mailing_street", type: "string" },
    { service_attribute: "MailingCity", hull_top_level_trait: "city", hull_trait: "mailing_city", type: "string" },
    { service_attribute: "MailingPostalCode", hull_top_level_trait: "postal_code", hull_trait: "mailing_postal_code", type: "string" },
    { service_attribute: "MailingState", hull_top_level_trait: "state", hull_trait: "mailing_state", type: "string" },
    { service_attribute: "MailingCountry", hull_top_level_trait: "country", hull_trait: "mailing_country", type: "string" },
    // { service_attribute: "MiddleName", hull_top_level_trait: null, hull_trait: "middle_name", type: "string" }, // No such column 'MiddleName' on entity 'Contact'
    { service_attribute: "Birthdate", hull_top_level_trait: null, hull_trait: "birthdate", type: "string" },
    // { service_attribute: "DoNotCall", hull_top_level_trait: null, hull_trait: "do_not_call", type: "string" }, // No such column 'DoNotCall' on entity 'Contact'
    // { service_attribute: "MailingCountryCode", hull_top_level_trait: null, hull_trait: "mailing_country_code", type: "string" }, // No such column 'MailingCountryCode' on entity 'Contact'
    // { service_attribute: "Website", hull_top_level_trait: "website", hull_trait: "website", type: "string" }, // No such column 'Website' on entity 'Contact'
    { service_attribute: "Id", hull_top_level_trait: null, hull_trait: "id", type: "string" },
    { service_attribute: "OwnerId", hull_top_level_trait: null, hull_trait: "owner_id", type: "string" }
  ]
};

/**
 * Returns a mapping between Salesforce attributes and Hull top level
 * traits for the given Salesforce record type.
 * @param {String} type Salesforce record type (Lead | Contact).
 * @return {Object} Salesforce attributes names to Hull top level trait names.
 */
export function getServiceAttributeToHullTopLevel(type) {
  return _.mapValues(_.keyBy(_.get(DEFAULT_MAPPING, type, []), "service_attribute"), mapping => mapping.hull_top_level_trait);
}

/**
 * Returns a mapping between Salesforce attributes and Salesforce traits into
 * Hull for the given Salesforce record type.
 * @param {String} type Salesforce record type (Lead | Contact).
 * @return {Object} Salesforce attributes names to Salesforce traits names in
 *                  Hull (without "salesforce_{lead|contact}/" prefix).
 */
export function getServiceAttributeToHullTrait(type) {
  return _.mapValues(_.keyBy(_.get(DEFAULT_MAPPING, type, []), "service_attribute"), mapping => mapping.hull_trait);
}
