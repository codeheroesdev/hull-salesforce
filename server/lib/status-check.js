import _ from "lodash";
import Agent from "../agent";
import { buildConfigFromShip } from '../config';

export default function statusCheck(req, res) {
  const { ship = {}, client = {}, shipApp = {} } = req.hull;
  const messages = [];
  let status = "ok";
  const promises = [];

  if (_.get(ship, "private_settings.instance_url") && !_.get(ship, "private_settings.access_token")) {
    status = "error";
    messages.push("Missing API access token.");
  }

  if (_.get(ship, "private_settings.instance_url") && !_.get(ship, "private_settings.refresh_token")) {
    status = "error";
    messages.push("Missing API refresh token.");
  }

  if (
    _.get(ship, "private_settings.login_url")
    && (!_.get(ship, "private_settings.salesforce_login") || !_.get(ship, "private_settings.salesforce_password"))
  ) {
    status = "error";
    messages.push("Missing API login and password.");
  }

  if (messages.length === 0) {
    const { organization, secret } = client.configuration();
    const config = buildConfigFromShip(ship, organization, secret);
    const agent = new Agent(config);

    promises.push(agent.connect().catch(err => {
      status = "error";
      messages.push(`Could not connect to SFDC API. Error: ${_.get(err, "message", "Unknown")}`);
    }));
  }

  Promise.all(promises).then(() => {
    res.json({ status, messages });
    return client.put(ship.id, { status, status_messages: messages });
  });
}
