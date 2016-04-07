jest.dontMock('../sync');
jest.dontMock('hogan.js');

let Mappings = {
  Lead: {
    type: 'Lead',
    fields: {
      FirstName: { key: 'first_name', defaultValue: '[Unknown]', overwrite: false },
      LastName: { key: 'last_name', defaultValue: '[Unknown]', overwrite: true },
      Email: 'email',
      Company: { key: 'traits_company', defaultValue: '[Unknown]' },
      City: { key: 'city', defaultValue: 'City of {{last_name}}', overwrite: true },
      Foo: { tpl: 'Hello({{id}})' }
    }
  },
  Contact: {
    type: 'Contact',
    fields: {
      FirstName: { key: 'first_name' },
      LastName: { key: 'last_name' },
      Email: 'email'
    }
  }
}

let User = { id: '123', email: 'bob@bob.com', first_name: 'Bob',         last_name: 'Dufion' };
let Lead = { Id: '456', Email: 'bob@bob.com', FirstName:  'Jean Michel', LastName: 'Dugommier', attributes: { type: 'Lead' } };

describe('getUpdatedFields', ()=> {
  let sync = require('../sync');
  it('applies all mapping options', ()=> {
    let updates = sync.getUpdatedFields(User, Lead, Mappings.Lead);
    expect(updates).toEqual({
      Email: 'bob@bob.com',
      LastName: 'Dufion',
      Company: '[Unknown]',
      City: 'City of Dufion',
      Foo: 'Hello(123)'
    });
  })

  it('overwrites field except if it is defaultValue', ()=> {
    let LeadWithCity = {
      ...Lead,
      City: 'Paris',
      FirstName: '[Unknown]'
    };
    let updates = sync.getUpdatedFields(User, LeadWithCity, Mappings.Lead);
    expect(updates).toEqual({
      Email: 'bob@bob.com',
      FirstName: 'Bob',
      LastName: 'Dufion',
      Company: '[Unknown]',
      Foo: 'Hello(123)'
    });
  });
});


let Contact = { Id: '123X9X', LastName: 'Ducontact', Email: 'contact@bob.com', attributes: { type: 'Contact' } };

describe('syncRecords', ()=> {
  let sync = require('../sync');
  it('is fine...', ()=> {
    let NewUser = { id: '44444', email: 'new@user.com', first_name: 'New', last_name: 'User', city: 'Paris', traits_company: 'Hull Inc' };
    let NothingChanged = { id: '000', email: 'nothing@change.org', first_name: 'Nothing', last_name: 'Changed' };
    let NothingChangedContact = sync.getUpdatedFields(NothingChanged, {}, Mappings.Contact);

    let SearchResults = {
      [Lead.Email]: { Lead },
      [Contact.Email]: { Contact },
      [NothingChangedContact.Email]: { Contact: NothingChangedContact }
    };

    let records = sync.syncRecords(
      SearchResults,
      [ User, { email: 'contact@bob.com', first_name: 'Jean Pierre' }, NewUser, NothingChanged ],
      { mappings: Mappings }
    );

    expect(records.Contact.length).toEqual(1);
    expect(records.Contact[0]).toEqual({ FirstName: 'Jean Pierre', Email: 'contact@bob.com' });

    expect(records.Lead).toEqual([
      { LastName: 'Dufion',
        Company: '[Unknown]',
        Email: 'bob@bob.com',
        Foo: 'Hello(123)',
        City: 'City of Dufion' },
      { FirstName: 'New',
        LastName: 'User',
        Email: 'new@user.com',
        Company: 'Hull Inc',
        Foo: 'Hello(44444)',
        City: 'Paris' }
    ]);
  });

})
