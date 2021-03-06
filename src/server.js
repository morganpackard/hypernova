import cluster from 'cluster';
import express from 'express';

import './environment';
import Module from './Module';
import coordinator from './coordinator';
import createGetComponent from './createGetComponent';
import getFiles from './getFiles';
import loadModules from './loadModules';
import logger from './utils/logger';
import createVM from './createVM';
import worker from './worker';

const defaultConfig = {
  bodyParser: {
    limit: 1024 * 1000,
  },
  devMode: false,
  endpoint: '/batch',
  files: [],
  logger: {},
  plugins: [],
  port: 8080,
};

export default function hypernova(userConfig, onServer) {
  const config = Object.assign({}, defaultConfig, userConfig);

  if (typeof config.getComponent !== 'function') {
    throw new TypeError('Hypernova requires a `getComponent` property and it must be a function');
  }

  // optionally expose some functions to whoever's instiating hypernova.
  // Preferring this over slapping properties on to 'app', which is an express
  // app and maybe shouldn't know anything about hypernova.
  // TODO - clearInitializerCache currently affects only the worker on which it  is called.
  // We plan to broadcast the functional call across all workers.
  if (config.getApi) {
    config.getApi({
      clearModuleInitializerCache: Module.clearInitializerCache,
    });
  }

  logger.init(config.logger);

  const app = express();

  if (config.devMode) {
    worker(app, config, onServer);
  } else if (cluster.isMaster) {
    coordinator();
  } else {
    worker(app, config, onServer, cluster.worker.id);
  }

  return app;
}

// I'm "exporting" them here because I want to export these but still have a default export.
// And I want it to work on CJS.
// I want my cake and to eat it all.
hypernova.Module = Module;
hypernova.createGetComponent = createGetComponent;
hypernova.createVM = createVM;
hypernova.getFiles = getFiles;
hypernova.loadModules = loadModules;
