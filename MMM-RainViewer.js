// MMM-RainViewer.js

Module.register("MMM-RainViewer", {
  // Default module config
  defaults: {
    longitude: -81.0912,
    latitude: 32.0809,
    zoom: 6,
    width: 300,
    height: 300,
    updateInterval: 5 * 60 * 1000,
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
    self.radarLayers = [];
    self.currentRadarFrame = -1;
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
      for (var ts of JSON.parse(rainViewerLoader.response).slice(-self.config.maxFrames)) {
        if (!self.timestamps.includes(ts)) {
          self.timestamps.push(ts);
        }
      }

      for (var ts of self.timestamps.slice(0, -self.config.maxFrames)) {
        if (self.radarLayers[ts]) {
          if (self.map.hasLayer(self.radarLayers[ts])) {
            self.map.removeLayer(self.radarLayers[ts]);
          }

          self.radarLayers = self.radarLayers.filter(item => item !== ts);
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

    setTimeout(() => {
      self.map = L.map(wrapper).setView([self.config.latitude, self.config.longitude], self.config.zoom);

      self.baseLayer = L.geoJSON([], {
        pane: "tilePane",
        color: "#303030",
        weight: 1,
      }).addTo(self.map);

      var baseLayerLoader = new XMLHttpRequest();
      baseLayerLoader.open("GET", self.file("gz_2010_us_050_00_500k.json"), true);
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

    if (!self.radarLayers[ts]) {
      const url = `https://tilecache.rainviewer.com/v2/radar/${ts}/256/{z}/{x}/{y}/2/1_1.png`;
      self.radarLayers[ts] = L.tileLayer(url, {
        tileSize: 256,
        opacity: 0.001,
        zIndex: ts,
      });
    }

    if (!self.map.hasLayer(self.radarLayers[ts])) {
      self.map.addLayer(self.radarLayers[ts]);
    }
  },

  advanceRadarFrame: function() {
    var self = this;

    self.nextRadarFrame = (self.nextRadarFrame + 1) % (self.timestamps.length + 4);
    if (self.nextRadarFrame < self.timestamps.length && self.nextRadarFrame !== self.currentRadarFrame) {
      const currentTimestamp = self.timestamps[self.currentRadarFrame];
      const nextTimestamp = self.timestamps[self.nextRadarFrame];
      const preloadFrame = self.nextRadarFrame + 1;

      self.addLayer(nextTimestamp);
      self.radarLayers[nextTimestamp].setOpacity(1);

      if (self.radarLayers[currentTimestamp]) {
        self.radarLayers[currentTimestamp].setOpacity(0);
      }

      if (preloadFrame < self.timestamps.length) {
        self.addLayer(self.timestamps[preloadFrame]);
      }

      self.currentRadarFrame = self.nextRadarFrame;
    }
  },
});
