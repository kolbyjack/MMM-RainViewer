// MMM-RainViewer.js

Module.register("MMM-RainViewer", {
  // Default module config
  defaults: {
    longitude: -81.0912,
    latitude: 32.0809,
    zoom: 6,
    width: 300,
    height: 300,
    updateInterval: 10 * 60 * 1000,
    maxFrames: 10,
    filter: "brightness(0.5)",
  },

  getScripts: function() {
    return [this.file("leaflet/leaflet.js")];
  },

  getStyles: function() {
    return [this.file("MMM-RainViewer.css"), this.file("leaflet/leaflet.css")];
  },

  start: function() {
    var self = this;

    self.map = null;
    self.timestamps = [];
    self.radarLayers = {};
    self.currentTimestamp = null;
    self.nextRadarFrame = -1;
    self.animationTimer = null;
  },

  notificationReceived: function(notification, payload, sender) {
    // Do nothing
  },

  socketNotificationReceived: function(notification, payload) {
    // Do nothing
  },

  getData: function() {
    var self = this;

    var rainViewerLoader = new XMLHttpRequest();
    rainViewerLoader.open("GET", "https://tilecache.rainviewer.com/api/maps.json", true);
    rainViewerLoader.onload = e => {
      const newTimestamps = JSON.parse(rainViewerLoader.response).slice(-self.config.maxFrames);
      for (var ts of newTimestamps) {
        if (!self.timestamps.includes(ts)) {
          self.timestamps.push(ts);
        }
      }

      if (self.animationTimer === null) {
        self.animationTimer = setInterval(() => self.advanceRadarFrame(), 500);
      }
    };
    rainViewerLoader.send();
  },

  getDom: function() {
    var self = this;

    var wrapper = document.createElement("div");
    wrapper.className = "wrapper";
    wrapper.style.width = `${self.config.width}px`;
    wrapper.style.height = `${self.config.height}px`;

    setTimeout(() => {
      self.map = L.map(wrapper).setView([self.config.latitude, self.config.longitude], self.config.zoom);

      self.baseLayer = L.geoJSON([], {
        pane: "tilePane",
        color: "#303030",
        weight: 1,
      }).addTo(self.map);

      var baseLayerLoader = new XMLHttpRequest();
      baseLayerLoader.open("GET", self.file("gz_2010_us_050_00_20m.min.json"), true);
      baseLayerLoader.onload = e => {
        self.baseLayer.addData(JSON.parse(baseLayerLoader.response));
      };
      baseLayerLoader.send();

      self.getData();
      setInterval(() => self.getData(), self.config.updateInterval);
    }, 1000);

    return wrapper;
  },

  addLayer: function(ts) {
    var self = this;

    if (!(ts in self.radarLayers)) {
      const url = `https://tilecache.rainviewer.com/v2/radar/${ts}/256/{z}/{x}/{y}/2/1_1.png`;
      self.radarLayers[ts] = L.tileLayer(url, {
        tileSize: 256,
        opacity: 0,
        zIndex: ts,
      });
    }

    if (!self.map.hasLayer(self.radarLayers[ts])) {
      self.map.addLayer(self.radarLayers[ts]);
    }
  },

  advanceRadarFrame: function() {
    var self = this;

    if (self.timestamps.length === 0) {
      return;
    }

    self.nextRadarFrame = (self.nextRadarFrame + 1) % (self.timestamps.length + 4);
    if (self.nextRadarFrame >= self.timestamps.length) {
      if (self.timestamps.length > self.config.maxFrames) {
        const oldTimestamps = self.timestamps.splice(0, self.timestamps.length - self.config.maxFrames);

        for (var ts of oldTimestamps) {
          const layer = self.radarLayers[ts];
          delete self.radarLayers[ts];

          if (layer && self.map.hasLayer(layer)) {
            self.map.removeLayer(layer);
          }
        }
      }

      return;
    }

    const nextTimestamp = self.timestamps[self.nextRadarFrame];
    if (nextTimestamp === self.currentTimestamp) {
      return;
    }

    self.addLayer(nextTimestamp);
    self.radarLayers[nextTimestamp].setOpacity(1);

    if (self.radarLayers[self.currentTimestamp]) {
      self.radarLayers[self.currentTimestamp].setOpacity(0);
    }

    const preloadFrame = (self.nextRadarFrame + 1) % self.timestamps.length;
    self.addLayer(self.timestamps[preloadFrame]);

    self.currentTimestamp = nextTimestamp;
  },
});
