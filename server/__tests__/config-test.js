/* eslint-disable */
import _ from "lodash";

jest.dontMock("lodash");
jest.dontMock("jsforce");

const secret = "secret";
const organization = "organization";
const ship = {
  private_settings: {},
};

describe("buildConfigFromShip", () => {
  it("build a config object from the ship config object", () => {

    const config = require("../lib/config");
    const getServiceAttributeToHullTopLevel = require("../lib/mapping-data").getServiceAttributeToHullTopLevel;
    const getServiceAttributeToHullTrait = require("../lib/mapping-data").getServiceAttributeToHullTrait;

    const c = config.buildConfigFromShip(ship, organization, secret);
    expect(_.keys(c)).toEqual(["hull", "settings", "salesforce", "sync", "mappings"]);
    expect(_.keys(c.mappings)).toEqual(["Lead", "Contact", "Account"]);
    _.keys(c.mappings).forEach((type) => {
      expect(_.keys(c.mappings[type])).toEqual(["type", "fetchFields", "fields", "fetchFieldsToTopLevel"]);
      expect(c.mappings[type].fetchFields).toEqual(getServiceAttributeToHullTrait(type));
      expect(c.mappings[type].fetchFieldsToTopLevel).toEqual(getServiceAttributeToHullTopLevel(type));
    });
  });
});
