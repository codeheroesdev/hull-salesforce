/* eslint-disable */
jest.dontMock("../sf");
jest.dontMock("lodash");
jest.dontMock("jsforce");

import { searchQuery, getMatchingPattern } from "../sf";

const mappings = {
  Foo: {
    type: "Foo",
    fields: { Id: "id", Foo: "bar" }
  },
  Bar: {
    type: "Bar",
    fields: { Id: "id", Bar: "foo" }
  }
};

describe("searchQuery with emails", () => {
  it("build a query from a list of emails", () => {
    const emails = ["bob@bob.com", "jon@jon.com"];
    const field = "EMAIL";
    const qry = searchQuery(field, emails, mappings);
    expect(qry).toEqual("FIND {\"bob@bob.com\" OR \"jon@jon.com\"} IN EMAIL FIELDS RETURNING Foo(Id,Foo), Bar(Id,Bar)");
  });
});

describe("searchQuery with domains", () => {
  it("build a query from a list of emails", () => {
    const domains = ["hull.io", "sforce.com"];
    const field = "NAME";
    const qry = searchQuery(field, domains, mappings);
    expect(qry).toEqual("FIND {\"hull.io\" OR \"sforce.com\"} IN NAME FIELDS RETURNING Foo(Id,Foo), Bar(Id,Bar)");
  });
});

describe("getMatchingPattern", () => {
  it("returns the first matching pattern in the list", () => {
    const website = "http://www.domain.com/subdomain/";
    const domains = ["hull.io", "main.com", "domain.com"];
    const match = getMatchingPattern(website, domains);
    // TODO: to improve, this function should return the best match, not the first
    expect(match).toEqual("main.com");
  });
});
