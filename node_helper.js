"use strict";

const NodeHelper = require("node_helper");
const http = require("http");
const https = require("https");

module.exports = NodeHelper.create({
  start: function() {
    const self = this;

    self.setupProxy();
    console.log(`Starting node helper for: ${self.name}`);
  },

  setupProxy: function() {
    const self = this;

    // https://stackoverflow.com/a/10435819
    const handler = (downstreamRequest, downstreamResponse, next) => {
      const url = downstreamRequest.url.substring(1);
      const module = url.startsWith("http:") ? http : https;
      const upstreamRequest = module.request(url, upstreamResponse => {
        downstreamResponse.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
        upstreamResponse.on("data", chunk => downstreamResponse.write(chunk));
        upstreamResponse.on("close", () => downstreamResponse.end());
        upstreamResponse.on("end", () => downstreamResponse.end());
      }).on("error", e => {
        try {
          downstreamResponse.writeHead(500);
          downstreamResponse.write(e.message);
        } catch (e) {
        }
        downstreamResponse.end();
      });

      upstreamRequest.end();
    };

    self.proxyHandler = handler;
    self.expressApp.use(`/modules/MMM-RainViewer/proxy/`, handler);
  },
});
