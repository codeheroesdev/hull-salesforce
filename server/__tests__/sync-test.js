jest.dontMock("../sync");
jest.dontMock("hogan.js");

const Mappings = {
  Lead: {
    type: "Lead",
    fields: {
      FirstName: { key: "first_name", defaultValue: "[Unknown]", overwrite: false },
      LastName: { key: "last_name", defaultValue: "[Unknown]", overwrite: true },
      Email: "email",
      Company: { key: "traits_company", defaultValue: "[Unknown]" },
      City: { key: "city", defaultValue: "City of {{last_name}}", overwrite: true },
      Foo: { tpl: "Hello({{id}})" },
      Zero: { key: "zero" }
    }
  },
  Contact: {
    type: "Contact",
    fields: {
      FirstName: { key: "first_name" },
      LastName: { key: "last_name" },
      Email: "email"
    }
  }
};

const User = { id: "123", email: "bob@bob.com", first_name: "Bob", last_name: "Dufion", zero: 0 };
const Lead = { Id: "456", Email: "bob@bob.com", FirstName: "Jean Michel", LastName: "Dugommier", attributes: { type: "Lead" } };

describe("getUpdatedFields", () => {
  const sync = require("../sync");
  it("applies all mapping options", () => {
    const updates = sync.getUpdatedFields(User, Lead, Mappings.Lead);
    expect(updates).toEqual({
      Email: "bob@bob.com",
      LastName: "Dufion",
      Company: "[Unknown]",
      City: "City of Dufion",
      Foo: "Hello(123)",
      Zero: 0
    });
  });

  it("overwrites field except if it is defaultValue", () => {
    const LeadWithCity = {
      ...Lead,
      City: "Paris",
      FirstName: "[Unknown]"
    };
    const updates = sync.getUpdatedFields(User, LeadWithCity, Mappings.Lead);
    expect(updates).toEqual({
      Email: "bob@bob.com",
      FirstName: "Bob",
      LastName: "Dufion",
      Company: "[Unknown]",
      Foo: "Hello(123)",
      Zero: 0
    });
  });
});


const Contact = { Id: "123X9X", LastName: "Ducontact", Email: "contact@bob.com", attributes: { type: "Contact" } };

describe("syncRecords", () => {
  const sync = require("../sync");
  it("is fine...", ()=> {
    const NewUser = { id: "44444", email: "new@user.com", first_name: "New", last_name: "User", city: "Paris", traits_company: "Hull Inc" };
    const NothingChanged = { id: "000", email: "nothing@change.org", first_name: "Nothing", last_name: "Changed" };
    const NothingChangedContact = sync.getUpdatedFields(NothingChanged, {}, Mappings.Contact);

    const SearchResults = {
      [Lead.Email]: { Lead },
      [Contact.Email]: { Contact },
      [NothingChangedContact.Email]: { Contact: NothingChangedContact }
    };

    const records = sync.syncRecords(
      SearchResults,
      [User, { email: "contact@bob.com", first_name: "Jean Pierre" }, NewUser, NothingChanged],
      { mappings: Mappings }
    );

    expect(records.Contact.length).toEqual(1);
    expect(records.Contact[0]).toEqual({ FirstName: "Jean Pierre", Email: "contact@bob.com" });

    expect(records.Lead).toEqual([
      { LastName: "Dufion",
        Company: "[Unknown]",
        Email: "bob@bob.com",
        Foo: "Hello(123)",
        City: "City of Dufion",
        Zero: 0
      },
      { FirstName: "New",
        LastName: "User",
        Email: "new@user.com",
        Company: "Hull Inc",
        Foo: "Hello(44444)",
        City: "Paris" }
    ]);
  });
});
