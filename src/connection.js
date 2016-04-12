import jsforce from 'jsforce';
import librato from 'librato-node';

function increment(metric, value, options) {
  try {
    if (librato.increment) {
      librato.increment(metric, value, options);
    }
  } catch(err) {
    console.warn('Librato error', err)
  }
}

function measure(metric, value, options) {
  try {
    if (librato.measure) {
      librato.measure(metric, value, options);
    }
  } catch(err) {
    console.warn('Librato error', err)
  }
}

export default class Connection extends jsforce.Connection {


  setShipId(shipId) {
    this._shipId = shipId;
  }

  request(request, options, callback) {
    increment('salesforce:requests', 1, { source: this._shipId });
    const ret = super.request(request, options, callback);
    ret.then((res) => {
      if (this.limitInfo && this.limitInfo.apiUsage) {
        measure('salesforce:used', this.limitInfo.apiUsage.used, { source: this._shipId });
      }
    }, (res) => {
      increment('salesforce:errors', 1, { source: this._shipId });
    });
    return ret;
  }

}
