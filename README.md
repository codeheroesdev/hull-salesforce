# Hullforce

Push Hull users to Salesforce.

[![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/sbellity/hullforce)

## Installation

- Click on the "Deploy to Heroku Button"
- Enter credentials for Hull and Salesforce
- Manually setup the Heroku Scheduler to add a task to run every 10minutes (or every hour). The task to run is : `npm run sync`

## Configuration

#### Credentials

Configured via Hull Dashboard.

#### Fields Mapping

Field settings options are

- `key` the key of the field in the Hull UserReport object
- `defaultValue` default value to set if the value is undefined
- `overwrite` if set to true, the value set on hull will always overwrite the value on Salesforce. defaults to false
- `tpl` use instead of `key` for custom values built from a mustache template. (context of the template is the whole UserReport object)

## Usage

    npm run sync

## Development

To run the tests suite :

    npm test

And in tdd mode

    gulp tdd
