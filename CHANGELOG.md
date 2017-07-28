# Changelog

## v0.4.2
- [feature] use account salesforce id to sync when it is available in hull

## v0.4.1
- [feature] export hull accounts to salesforce matching domain to Website

## v0.4.0
- [feature] import salesforce accounts into hull

## v0.3.0
- [feature] do not send all users when no synchronized segment is defined
- [feature] fetch all default salesforce attributes
- [feature] setIfNull top level Hull properties when attributes can be mapped

## v0.2.6
- improved documentation
- improved settings page

## v0.2.5
- revert the value of limit above which the SFDC client switch to bulk API

## v0.2.4
- fix logging

## v0.2.3
- join array values to strings before sending to SFDC
- replace `console.*` calls with `client.logger.*` to add more context

## v0.2.2
- allow overwriting oauth endpoint for accessing sandbox accounts
