// MMM-RainViewer.js

Module.register("MMM-RainViewer", {
  // Default module config
  defaults: {
    longitude: -81.0912,
    latitude: 32.0809,
    zoom: 6,
    scheme: 2,
    width: 300,
    height: 300,
    updateInterval: 10 * 60 * 1000,
    maxFrames: 10,
    showNHCForecasts: true,
    shape: "square",
    basemap: "us-states",
    markers: [],
  },

  getScripts: function() {
    let self = this;
    let scripts = ["https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"];

    if (self.config.showNHCForecasts) {
      scripts.push("https://unpkg.com/shpjs@latest/dist/shp.js");
      scripts.push("https://calvinmetcalf.github.io/leaflet.shapefile/leaflet.shpfile.js");
    }

    return scripts;
  },

  getStyles: function() {
    let self = this;

    return [
      self.file("MMM-RainViewer.css"),
      "https://unpkg.com/leaflet@1.7.1/dist/leaflet.css",
    ];
  },

  start: function() {
    var self = this;

    self.map = null;
    self.timestamps = [];
    self.radarLayers = {};
    self.currentTimestamp = null;
    self.nextRadarFrame = -1;
    self.animationTimer = null;
    self.wrapper = null;
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

    if (self.config.showNHCForecasts) {
      self.fetchNHCForecasts();
    }
  },

  getDom: function() {
    var self = this;

    if (self.wrapper !== null) {
      return self.wrapper;
    }

    var wrapper = document.createElement("div");
    wrapper.className = "wrapper";
    if (self.config.shape === "circle") {
      wrapper.classList.add("circle");
    }
    wrapper.style.width = `${self.config.width}px`;
    wrapper.style.height = `${self.config.height}px`;

    setTimeout(() => {
      self.map = L.map(wrapper).setView([self.config.latitude, self.config.longitude], self.config.zoom);

      self.baseLayer = L.geoJSON([], {
        pane: "tilePane",
        color: "#c0c0c0",
        weight: 1,
      }).addTo(self.map);

      var baseLayerLoader = new XMLHttpRequest();
      baseLayerLoader.open("GET", self.getBaseLayerURL(), true);
      baseLayerLoader.onload = e => {
        self.baseLayer.addData(JSON.parse(baseLayerLoader.response));
      };
      baseLayerLoader.send();

      self.nhcForecastLayers = {};
      self.nhcForecastLayerGroup = L.layerGroup().addTo(self.map);

      for (var marker of self.config.markers) {
        if (Array.isArray(marker)) {
          marker = {position: marker};
        }
        L.marker(marker.position, marker.options).addTo(self.map);
      }

      self.getData();
      setInterval(() => self.getData(), self.config.updateInterval);
    }, 1000);

    self.wrapper = wrapper;
    return wrapper;
  },

  addLayer: function(ts) {
    var self = this;

    if (!(ts in self.radarLayers)) {
      const url = `https://tilecache.rainviewer.com/v2/radar/${ts}/256/{z}/{x}/{y}/${self.config.scheme}/1_1.png`;
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

  getBaseLayerURL: function() {
    const self = this;
    const basemaps = {
      "us-states": "gz_2010_us_040_00_20m.min.json",
      "us-counties": "gz_2010_us_050_00_20m.min.json",
      "world": "ne_50m_admin_0_countries.min.json",
      "world-110m": "ne_110m_admin_0_countries.min.json",
    };
    const usermap = self.config.basemap.toLowerCase();
    const basemap = (usermap in basemaps) ? usermap : "us-states";

    return self.file(basemaps[basemap], true);
  },

  corsUrl: function(url) {
    return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  },

  getFeatureStyle: function(feature) {
    let colors = {
      "LineString": "black",
      "Point": "black",
      "Polygon": "red",
    };
    let defaultColor = "blue";

    return {
      opacity: 1,
      fillOpacity: (feature.geometry.type === "Polygon") ? 0.3 : 1,
      radius: 5,
      color: colors[feature.geometry.type] || defaultColor,
      zIndex: (feature.geometry.type === "Polygon") ? 1 : 2,
    };
  },

  pointToLayer: function(feature, latlon) {
    return L.circleMarker(latlon, {
      opacity: 1,
      fillOpacity: 0.9,
      color: "black",
    });
  },

  fetchNHCForecasts: function() {
    let self = this;

    fetch(self.corsUrl("https://www.nhc.noaa.gov/gis-at.xml"))
      .then(response => response.text())
      .then(xml => new DOMParser().parseFromString(xml, "text/xml"))
      .then(rss => {
        for (let k in self.nhcForecastLayers) {
          self.nhcForecastLayers[k].active = false;
        }

        rss.querySelectorAll("item").forEach(item => {
          let title = item.querySelector("title").innerHTML;
          let link = item.querySelector("link").innerHTML;

          if (link in self.nhcForecastLayers) {
            self.nhcForecastLayers[link].active = true;
          } else if (title.startsWith("Advisory ") && title.includes("Forecast [shp]")) {
            self.nhcForecastLayers[link] = {
              layer: null,
              active: true,
            };

            var loader = new XMLHttpRequest();
            loader.open("GET", self.corsUrl(link), true);
            loader.responseType = "arraybuffer";
            loader.onload = e => {
              let features = [];
              let filtering = true;
              let layer = new L.Shapefile(loader.response, {
                filter: (geojson) => {
                  if (filtering) {
                    features.push(geojson);
                  }
                  return !filtering;
                },
                style: (feature) => self.getFeatureStyle(feature),
                pointToLayer: (feature, latlon) => { return self.pointToLayer(feature, latlon) },
              });
              layer.once("data:loaded", () => {
                filtering = false;
                features.sort((a, b) => {
                  const weights = {
                    "Polygon": 1,
                    "LineString": 2,
                    "Point": 3,
                  };
                  return (weights[a.geometry.type] || 4) - (weights[b.geometry.type] || 4);
                });
                features.forEach(feature => layer.addData(feature));
                features = [];
                filtering = true;
              });
              layer.addTo(self.map);
              self.nhcForecastLayers[link].layer = layer;
            };
            loader.send();
          }
        });

        Object.keys(self.nhcForecastLayers).forEach(k => {
          let layer = self.nhcForecastLayers[k];

          if (!layer.active) {
            self.map.removeLayer(layer.layer);
            delete self.nhcForecastLayers[k];
          }
        });
      });
  },
});
