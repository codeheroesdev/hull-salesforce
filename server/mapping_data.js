import _ from "lodash";

const DEFAULT_MAPPING = {
  Lead: [
    { salesforce_field_name: "Email", hull_top_level_field_name: "email", hull_salesforce_field_name: "email", type: "string" },
    // { salesforce_field_name: "HasOptedOutOfEmail",  hull_top_level_field_name: "accepts_marketing",           hull_salesforce_field_name: "has_opted_out_of_email", type: "bool" }, // No such column 'HasOptedOutOfEmail' on entity 'Lead'
    { salesforce_field_name: "FirstName", hull_top_level_field_name: "first_name", hull_salesforce_field_name: "first_name", type: "string" },
    { salesforce_field_name: "LastName", hull_top_level_field_name: "last_name", hull_salesforce_field_name: "last_name", type: "string" },
    { salesforce_field_name: "Name", hull_top_level_field_name: null, hull_salesforce_field_name: "name", type: "string" },
    // { salesforce_field_name: "Suffix",              hull_top_level_field_name: null,                          hull_salesforce_field_name: "suffix",                 type: "string" }, //No such column 'Suffix' on entity 'Lead'
    { salesforce_field_name: "IsConverted", hull_top_level_field_name: null, hull_salesforce_field_name: "is_converted", type: "bool" },
    { salesforce_field_name: "Salutation", hull_top_level_field_name: "salutation", hull_salesforce_field_name: "salutation", type: "string" },
    { salesforce_field_name: "Title", hull_top_level_field_name: "title", hull_salesforce_field_name: "title", type: "string" },
    { salesforce_field_name: "Company", hull_top_level_field_name: "company", hull_salesforce_field_name: "company", type: "string" },
    { salesforce_field_name: "Industry", hull_top_level_field_name: null, hull_salesforce_field_name: "industry", type: "string" },
    { salesforce_field_name: "Phone", hull_top_level_field_name: "phone", hull_salesforce_field_name: "phone", type: "string" },
    { salesforce_field_name: "MobilePhone", hull_top_level_field_name: "mobile_phone", hull_salesforce_field_name: "mobile_phone", type: "string" },
    { salesforce_field_name: "Fax", hull_top_level_field_name: "fax", hull_salesforce_field_name: "fax", type: "string" },
    { salesforce_field_name: "CreatedDate", hull_top_level_field_name: null, hull_salesforce_field_name: "created_at", type: "string" },

    // LastModifiedDate || SystemModstamp || LastActivityDate
    { salesforce_field_name: "LastModifiedDate", hull_top_level_field_name: null, hull_salesforce_field_name: "last_modified_date", type: "string" },
    { salesforce_field_name: "SystemModstamp", hull_top_level_field_name: null, hull_salesforce_field_name: "system_modstamp", type: "string" },
    { salesforce_field_name: "LastActivityDate", hull_top_level_field_name: null, hull_salesforce_field_name: "last_activity_date", type: "string" },

    { salesforce_field_name: "ConvertedDate", hull_top_level_field_name: null, hull_salesforce_field_name: "converted_at", type: "string" },
    { salesforce_field_name: "City", hull_top_level_field_name: "city", hull_salesforce_field_name: "city", type: "string" },
    { salesforce_field_name: "PostalCode", hull_top_level_field_name: "postal_code", hull_salesforce_field_name: "postal_code", type: "string" },
    { salesforce_field_name: "State", hull_top_level_field_name: "state", hull_salesforce_field_name: "state", type: "string" },
    { salesforce_field_name: "Country", hull_top_level_field_name: "country", hull_salesforce_field_name: "country", type: "string" },
    // { salesforce_field_name: "MiddleName",          hull_top_level_field_name: null,                          hull_salesforce_field_name: "middle_name",            type: "string" }, // No such column 'MiddleName' on entity 'Lead'
    { salesforce_field_name: "Industry", hull_top_level_field_name: null, hull_salesforce_field_name: "industry", type: "string" },
    // { salesforce_field_name: "CountryCode",         hull_top_level_field_name: null,                          hull_salesforce_field_name: "country_code",           type: "string" }, // No such column 'CountryCode' on entity 'Lead'
    { salesforce_field_name: "AnnualRevenue", hull_top_level_field_name: null, hull_salesforce_field_name: "annual_revenue", type: "string" },
    { salesforce_field_name: "Website", hull_top_level_field_name: "website", hull_salesforce_field_name: "website", type: "string" },
    { salesforce_field_name: "Id", hull_top_level_field_name: null, hull_salesforce_field_name: "id", type: "string" },
    { salesforce_field_name: "OwnerId", hull_top_level_field_name: null, hull_salesforce_field_name: "owner_id", type: "string" }
  ],
  Contact: [
    { salesforce_field_name: "Email", hull_top_level_field_name: "email", hull_salesforce_field_name: "email", type: "string" },
    // { salesforce_field_name: "HasOptedOutOfEmail",  hull_top_level_field_name: "accepts_marketing",           hull_salesforce_field_name: "has_opted_out_of_email", type: "bool" }, // No such column 'HasOptedOutOfEmail' on entity 'Contact'
    { salesforce_field_name: "FirstName", hull_top_level_field_name: "first_name", hull_salesforce_field_name: "first_name", type: "string" },
    { salesforce_field_name: "LastName", hull_top_level_field_name: "last_name", hull_salesforce_field_name: "last_name", type: "string" },
    { salesforce_field_name: "Name", hull_top_level_field_name: null, hull_salesforce_field_name: "name", type: "string" },
    // { salesforce_field_name: "Suffix",              hull_top_level_field_name: null,                          hull_salesforce_field_name: "suffix",                 type: "string" }, // No such column 'Suffix' on entity 'Contact'
    { salesforce_field_name: "Salutation", hull_top_level_field_name: "salutation", hull_salesforce_field_name: "salutation", type: "string" },
    { salesforce_field_name: "Title", hull_top_level_field_name: "title", hull_salesforce_field_name: "title", type: "string" },
    { salesforce_field_name: "Phone", hull_top_level_field_name: "phone", hull_salesforce_field_name: "phone", type: "string" },
    { salesforce_field_name: "MobilePhone", hull_top_level_field_name: "mobile_phone", hull_salesforce_field_name: "mobile_phone", type: "string" },

    // LastModifiedDate || SystemModstamp || LastActivityDate
    { salesforce_field_name: "LastModifiedDate", hull_top_level_field_name: null, hull_salesforce_field_name: "last_modified_date", type: "string" },
    { salesforce_field_name: "SystemModstamp", hull_top_level_field_name: null, hull_salesforce_field_name: "system_modstamp", type: "string" },
    { salesforce_field_name: "LastActivityDate", hull_top_level_field_name: null, hull_salesforce_field_name: "last_activity_date", type: "string" },

    { salesforce_field_name: "MailingStreet", hull_top_level_field_name: "street", hull_salesforce_field_name: "mailing_street", type: "string" },
    { salesforce_field_name: "MailingCity", hull_top_level_field_name: "city", hull_salesforce_field_name: "mailing_city", type: "string" },
    { salesforce_field_name: "MailingPostalCode", hull_top_level_field_name: "postal_code", hull_salesforce_field_name: "mailing_postal_code", type: "string" },
    { salesforce_field_name: "MailingState", hull_top_level_field_name: "state", hull_salesforce_field_name: "mailing_state", type: "string" },
    { salesforce_field_name: "MailingCountry", hull_top_level_field_name: "country", hull_salesforce_field_name: "mailing_country", type: "string" },
    // { salesforce_field_name: "MiddleName",          hull_top_level_field_name: null,                          hull_salesforce_field_name: "middle_name",            type: "string" }, // No such column 'MiddleName' on entity 'Contact'
    { salesforce_field_name: "Birthdate", hull_top_level_field_name: null, hull_salesforce_field_name: "birthdate", type: "string" },
    // { salesforce_field_name: "DoNotCall",           hull_top_level_field_name: null,                          hull_salesforce_field_name: "do_not_call",            type: "string" }, // No such column 'DoNotCall' on entity 'Contact'
    // { salesforce_field_name: "MailingCountryCode",  hull_top_level_field_name: null,                          hull_salesforce_field_name: "mailing_country_code",   type: "string" }, // No such column 'MailingCountryCode' on entity 'Contact'
    // { salesforce_field_name: "Website",             hull_top_level_field_name: "website",                     hull_salesforce_field_name: "website",                type: "string" }, // No such column 'Website' on entity 'Contact'
    { salesforce_field_name: "Id", hull_top_level_field_name: null, hull_salesforce_field_name: "id", type: "string" },
    { salesforce_field_name: "OwnerId", hull_top_level_field_name: null, hull_salesforce_field_name: "owner_id", type: "string" }
  ]
};

export default function getFieldsToHull(type) {
  return _.mapValues(_.keyBy(_.get(DEFAULT_MAPPING, type, []), "salesforce_field_name"), mapping => mapping.hull_top_level_field_name);
}

