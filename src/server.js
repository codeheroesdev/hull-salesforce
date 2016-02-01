import express from 'express';
import { Agent } from './agent';
import path from 'path';
var bodyParser = require('body-parser');

var SNSClient = require('aws-snsclient');

var handleNotification = SNSClient(function(err, message) {
    if (err) {
        console.warn('OOPS: ', err);
    }
    console.log(message);
});


export function Server(config) {

  var syncing = {};
  let app = express();

  function syncDone(shipId) {
    setTimeout(()=> {
      syncing[shipId] = false;
    }, 30000)
  }

  function isSyncing(shipId) {
    return !!syncing[shipId];
  }

  app.use(express.static(path.resolve(__dirname, '..', 'dist')));
  app.use(express.static(path.resolve(__dirname, '..', 'assets')));

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  app.post('/notify', handleNotification);

  app.post('/sync', (req, res)=> {

    res.type('application/json');

    const orgUrl = req.body.orgUrl || process.env.HULL_ORG_URL;
    const shipId = req.body.shipId || process.env.HULL_SHIP_ID;
    const secret = req.body.secret || process.env.SECRET;

    if (!isSyncing(shipId)) {
      const sync = syncing[shipId] = Agent.syncShip(orgUrl, shipId, secret);

      sync.then(function(response) {
        console.warn('Sync Done !', response);
        res.status(200).end(JSON.stringify({ response: response, shipId: shipId, orgUrl: orgUrl }));
        syncDone(shipId);
      }, function(err) {
        res.status(401).end(JSON.stringify({ status: 401, error: err.toString() }));
        syncDone(shipId);
      });

      sync.catch(function(err) {
        res.status(401).end(JSON.stringify({ status: 500, error: err.toString() }));
        syncDone(shipId);
      })
    } else {
      res.status(429).end(JSON.stringify({ status: 429, error: 'Too many requests' }));
    }
  });

  app.get('/manifest.json', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'manifest.json'));
  });

  return app;

}
