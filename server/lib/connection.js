import jsforce from "jsforce";
import librato from "librato-node";
import Hull from "hull";

function increment(metric, value, options) {
  try {
    if (librato && librato.increment) {
      librato.increment(metric, value, options);
    }
  } catch (err) {
    // Hull.logger.warn("Librato error", err)
  }
}

function measure(metric, value, options) {
  try {
    if (librato && librato.measure) {
      librato.measure(metric, value, options);
    }
  } catch (err) {
    // Hull.logger.warn("Librato error", err)
  }
}

export default class Connection extends jsforce.Connection {


  setShipId(shipId) {
    this._shipId = shipId;
  }

  request(request, options, callback) {
    increment("salesforce:requests", 1, { source: this._shipId });
    const ret = super.request(request, options, callback);
    ret.then(() => {
      if (this.limitInfo && this.limitInfo.apiUsage) {
        measure("salesforce:used", this.limitInfo.apiUsage.used, { source: this._shipId });
      }
    }, (res) => {
      Hull.logger.warn("salesforce API error", JSON.stringify({ request, options, res }));
      increment("salesforce:errors", 1, { source: this._shipId });
    });
    return ret;
  }
}
