jest.dontMock("../sf");
jest.dontMock("lodash");
jest.dontMock("jsforce");

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
    const SF = require("../sf").SF;
    const sf = new SF();
    const emails = ["bob@bob.com", "jon@jon.com"];
    const qry = sf.searchEmailsQuery(emails, Mappings);
    expect(qry).toEqual("FIND {\"bob@bob.com\" OR \"jon@jon.com\"} IN Email FIELDS RETURNING Foo(Id,Foo), Bar(Id,Bar)");
  });
});
