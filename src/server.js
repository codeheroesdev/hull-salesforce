import express from 'express';
import { Agent } from './agent';
import path from 'path';
import { NotifHandler } from 'hull';
import bodyParser from 'body-parser';

export function Server(config) {


  const notifHandler = NotifHandler({
    events: {
      'user_report:update' : function({ message }, { ship, hull }) {
        console.warn("Hull.config: ", hull.configuration());
        return Agent.syncUsers(hull, ship, [ message.user ]);
      }
    }
  });

  const syncing = {};
  const app = express();

  function syncDone(shipId) {
    console.warn("Boom done !", shipId);
    setTimeout(()=> {
      syncing[shipId] = false;
    }, 3000);
  }

  function isSyncing(shipId) {
    return !!syncing[shipId];
  }

  app.use(express.static(path.resolve(__dirname, '..', 'dist')));
  app.use(express.static(path.resolve(__dirname, '..', 'assets')));

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  app.post('/notify', notifHandler);

  app.post('/sync', (req, res)=> {

    res.type('application/json');

    const orgUrl = req.body.organization || req.body.orgUrl || process.env.HULL_ORG_URL;
    const shipId = req.body.ship || req.body.shipId || process.env.HULL_SHIP_ID;
    const secret = req.body.secret || process.env.SECRET;

    if (!orgUrl || !shipId) {
      return res.status(400).end(JSON.stringify({ status: 400, error: "Missing orgUrl and shipId"  }));
    }

    if (!isSyncing(shipId)) {
      const sync = syncing[shipId] = Agent.syncShip(orgUrl, shipId, secret);

      sync.then(function(response) {
        res.status(200)
        res.end(JSON.stringify({ response: response, shipId: shipId, orgUrl: orgUrl }));
        syncDone(shipId);
      }, function(err) {
        res.status(401)
        res.end(JSON.stringify({ status: 401, error: err.toString() }));
        syncDone(shipId);
      });

      sync.catch(function(err) {
        res.status(401)
        res.end(JSON.stringify({ status: 500, error: err.toString() }));
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
