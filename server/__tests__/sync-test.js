/* eslint-disable */
jest.dontMock("../sync");
jest.dontMock("hogan.js");

import { syncUsers, syncAccounts, getUpdatedFields } from "../sync";

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
  },
  Account: {
    type: "Account",
    fields: {
      Name: { key: "name", defaultValue: "[Unknown]", overwrite: false },
      Website: "domain",
      City: { key: "account.city", overwrite: true },
      Zero: { key: "zero" }
    }
  }
};

// Hull records
const User = { id: "123", email: "bob@bob.com", first_name: "Bob", last_name: "Dufion", zero: 0 };
const account = { id: "1234", name: "Hull", domain: "hull.io", zero: 0 };

// Salesforce records
const Lead = { Id: "456", Email: "bob@bob.com", FirstName: "Jean Michel", LastName: "Dugommier", attributes: { type: "Lead" } };
const Contact = { Id: "123X9X", LastName: "Ducontact", Email: "contact@bob.com", attributes: { type: "Contact" } };
const sfAccount = { Id: "3412", Name: "Hull", Website: "http://www.hull.io", attributes: { type: "Account" } };

describe("getUpdatedFields for users", () => {
  it("applies all mapping options", () => {
    const updates = getUpdatedFields(User, Lead, Mappings.Lead, { Email: User.email });
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
    const updates = getUpdatedFields(User, LeadWithCity, Mappings.Lead, { Email: User.email });
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

describe("getUpdatedFields for accounts", () => {
  it("applies all mapping options", () => {
    const updates = getUpdatedFields(account, sfAccount, Mappings.Account, { Id: sfAccount.Id, Website: sfAccount.Website });
    expect(updates).toEqual({
      Id: "3412",
      Website: "http://www.hull.io",
      Zero: 0
    });
  });

  it("overwrites field except if it is defaultValue", () => {
    const AccountWithCity = {
      ...sfAccount,
      City: "Paris",
      Name: "[Unknown]"
    };
    const updates = getUpdatedFields(account, AccountWithCity, Mappings.Account, { Id: AccountWithCity.Id, Website: AccountWithCity.Website });
    expect(updates).toEqual({
      Id: "3412",
      Website: "http://www.hull.io",
      Name: "Hull",
      Zero: 0
    });
  });
});

describe("syncUsers", () => {
  it("is fine...", () => {
    const NewUser = { id: "44444", email: "new@user.com", first_name: "New", last_name: "User", city: "Paris", traits_company: "Hull Inc" };
    const NothingChanged = { id: "000", email: "nothing@change.org", first_name: "Nothing", last_name: "Changed" };
    const NothingChangedContact = getUpdatedFields(NothingChanged, {}, Mappings.Contact, { Email: NothingChanged.email });

    const SearchResults = {
      [Lead.Email]: { Lead },
      [Contact.Email]: { Contact },
      [NothingChangedContact.Email]: { Contact: NothingChangedContact }
    };

    const records = syncUsers(
      SearchResults,
      [User, { email: "contact@bob.com", first_name: "Jean Pierre" }, NewUser, NothingChanged],
      { mappings: Mappings }
    );

    expect(records.Contact.length).toEqual(1);
    expect(records.Contact[0]).toEqual({ FirstName: "Jean Pierre", Email: "contact@bob.com" });

    expect(records.Lead).toEqual([
      {
        LastName: "Dufion",
        Company: "[Unknown]",
        Email: "bob@bob.com",
        Foo: "Hello(123)",
        City: "City of Dufion",
        Zero: 0
      },
      {
        FirstName: "New",
        LastName: "User",
        Email: "new@user.com",
        Company: "Hull Inc",
        Foo: "Hello(44444)",
        City: "Paris"
      }
    ]);
  });
});

describe("syncAccounts", () => {
  it("is fine...", () => {
    const NewAccount = { id: "44444", domain: "new.com", name: "New" };
    const NothingChanged = { id: "000", domain: "nothing.org", name: "Changed" };
    const AlreadyMatched = { id: "111", name: "Hull", "salesforce/id": "abcd" };

    const SearchResults = {
      "hull.io": sfAccount,
      "nothing.org": { Id: "000", Website: "nothing.org", Name: "Changed" },
      "abcd": { Id: "abcd", Website: "hull.io" }
    };

    const records = syncAccounts(
      SearchResults,
      [
        account,
        NewAccount,
        NothingChanged,
        AlreadyMatched
      ],
      Mappings.Account
    );

    expect(records).toEqual([
      {
        Id: "3412",
        Website: "http://www.hull.io",
        Zero: 0
      },
      {
        Website: "new.com",
        Name: "New"
      },
      {
        Id: "abcd",
        Website: "hull.io",
        Name: "Hull"
      }
    ]);
  });
});
