jest.dontMock("../sf");
jest.dontMock("lodash");
jest.dontMock("jsforce");

const { searchEmailsQuery } = require("../sf");

const Mappings = {
  Foo: {
    type: "Foo",
    fields: { Id: "id", Foo: "bar" }
  },
  Bar: {
    type: "Bar",
    fields: { Id: "id", Bar: "foo" }
  }
};

describe("searchEmailsQuery", () => {
  it("build a query from a list of emails", () => {
    const emails = ["bob@bob.com", "jon@jon.com"];
    const qry = searchEmailsQuery(emails, Mappings);
    expect(qry).toEqual("FIND {\"bob@bob.com\" OR \"jon@jon.com\"} IN Email FIELDS RETURNING Foo(Id,Foo), Bar(Id,Bar)");
  });
});
