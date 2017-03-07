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

    const config = require("../config");
    const getServiceAttributeToHullTopLevel = require("../mapping-data").getServiceAttributeToHullTopLevel;
    const getServiceAttributeToHullTrait = require("../mapping-data").getServiceAttributeToHullTrait;

    const c = config.buildConfigFromShip(ship, organization, secret);
    expect(_.keys(c)).toEqual(["hull", "salesforce", "sync", "mappings"]);
    expect(_.keys(c.mappings)).toEqual(["Lead", "Contact"]);
    ["Lead", "Contact"].forEach((type) => {
      expect(_.keys(c.mappings[type])).toEqual(["type", "fetchFields", "fields", "fetchFieldsToTopLevel"]);
      expect(c.mappings[type].fetchFields).toEqual(getServiceAttributeToHullTrait(type));
      expect(c.mappings[type].fetchFieldsToTopLevel).toEqual(getServiceAttributeToHullTopLevel(type));
    });
  });
});
