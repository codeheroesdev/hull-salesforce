import _ from "lodash";
import Agent from "../agent";
import { buildConfigFromShip } from "../config";

export default function statusCheck(req, res) {
  const { ship = {}, client = {}, shipApp = {} } = req.hull;
  const messages = [];
  let status = "ok";
  const promises = [];

  if (_.get(ship, "private_settings.instance_url") && !_.get(ship, "private_settings.access_token")) {
    status = "error";
    messages.push("External service credentials aren’t set: missing API access token.");
  }

  if (_.get(ship, "private_settings.instance_url") && !_.get(ship, "private_settings.refresh_token")) {
    status = "error";
    messages.push("External service credentials aren’t set: missing API refresh token.");
  }

  if (_.isEmpty(_.get(ship, "private_settings.synchronized_segments", []))) {
    status = "error";
    messages.push("No segments will be synchronized because of missing configuration");
  }

  if (_.isEmpty(_.get(ship, "private_settings.leads_mapping", []))) {
    status = "error";
    messages.push("No leads will be sent from Hull to Salesforce due to missing configuration")
  }

  if (_.isEmpty(_.get(ship, "private_settings.fetch_lead_fields", []))) {
    if (status !== "error") {
      status = "warning";
    }
    messages.push("No lead fields will be fetched from Salesforce due to missing configuration")
  }

  if (_.isEmpty(_.get(ship, "private_settings.fetch_contact_fields", []))) {
    if (status !== "error") {
      status = "warning";
    }
    messages.push("No contacts fields will be fetched from Salesforce due to missing configuration")
  }

  if (_.isEmpty(_.get(ship, "private_settings.contacts_mapping", []))) {
    if (status !== "error") {
      status = "warning";
    }
    messages.push("No contacts will be sent from Hull to Salesforce due to missing configuration")
  }

  if (_.isEmpty(_.get(ship, "private_settings.salesforce_oauth_url"))) {
    status = "error";
    messages.push("oAuth url is empty");
  }

  if (
    _.get(ship, "private_settings.login_url")
    && (!_.get(ship, "private_settings.salesforce_login") || !_.get(ship, "private_settings.salesforce_password"))
  ) {
    status = "error";
    messages.push("External service credentials aren’t set: missing API login and password");
  }

  if (messages.length === 0) {
    const { organization, secret } = client.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);

    promises.push(agent.connect().then(conn =>
      Promise.all([
        conn.describeGlobal((err, res) => {
          if (err) {
            status = "error";
            return messages.push(`Error when trying to get test payload from SFDC API: ${_.get(err, "message", "Unknown")}`);
          }
          return res;
        }),
        conn.identity((err, res) => {
          if (err) {
            status = "error";
            return messages.push(`Error when trying to get user identity from SFDC API: ${_.get(err, "message", "Unknown")}`);
          }

          if (_.isEmpty(res.user_id) || _.isEmpty(res.organization_id)) {
            status = "error";
            return messages.push("Got empty results from SFDC API")
          }
          return res;
        })])
    ).catch(err => {
      status = "error";
      messages.push(`Could not connect to SFDC API. Error: ${_.get(err, "message", "Unknown")}`);
    }));
  }

  Promise.all(promises).then(() => {
    res.json({ status, messages });
    return client.put(ship.id, { status, status_messages: messages });
  });
}
