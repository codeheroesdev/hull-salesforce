import express from 'express';
import BatchSyncHandler from './batch-sync';
import Agent from './agent';
import path from 'path';
import { NotifHandler, BatchHandler } from 'hull';
import bodyParser from 'body-parser';
import librato from 'librato-node';

export function Server(config) {

  if (process.env.LIBRATO_TOKEN && process.env.LIBRATO_USER) {
    librato.configure({
      email: process.env.LIBRATO_USER,
      token: process.env.LIBRATO_TOKEN
    });
    librato.on('error', function(err) {
      console.error(err);
    });

    process.once('SIGINT', function() {
      librato.stop(); // stop optionally takes a callback
    });
    librato.start();
  }

  const app = express();

  app.use(express.static(path.resolve(__dirname, '..', 'assets')));

  app.post('/notify', NotifHandler({
    groupTraits: false,
    onSusbscribe(message, context) {
      console.warn("Hello new subscriber !", { message, context });
    },
    onError(message, status) {
      console.warn("Error", status, message);
    },
    handlers: {
      'user:update' : function({ message }, { ship, hull }) {
        try {
          BatchSyncHandler.handle(message, { ship, hull });
          if (process.env.LIBRATO_TOKEN && process.env.LIBRATO_USER) {
            librato.increment('user_report:update', 1, { source: ship.id });
          }
        } catch(err) {
          console.warn("Error in Users sync", err, err.stack);
          return err;
        }
      }
    }
  }));

  app.post('/batch', BatchHandler({
    batchSize: 2000,
    groupTraits: false,
    handler: (notifications = [], { ship, hull }) => {
      const users = notifications.map(n => n.message);
      return Agent
        .syncUsers(hull, ship, users, { applyFilters: false })
        .then(ok => console.warn('batch done', ok))
        .catch(err => console.warn('batch err', err));
    }
  }));

  app.get('/manifest.json', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'manifest.json'));
  });

  return {
    listen: (port) => app.listen(port),
    exit: ()=> BatchSyncHandler.exit()
  };

}
