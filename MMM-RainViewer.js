// MMM-RainViewer.js

function isNumeric(value) {
  if (typeof(value) === "number") {
    return true;
  }

  if (typeof(value) === "string") {
    return (!isNaN(value)) && (!isNaN(parseFloat(value)));
  }

  return false;
}

function cssLength(value) {
  return isNumeric(value) ? `${value}px` : value;
}

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
    showNHCData: true,
    shape: "square",
    basemap: "us-states",
    markers: [],
  },

  getScripts: function() {
    let self = this;
    let scripts = ["https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"];

    if (self.config.showNHCData) {
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
    self.outlookLayer = null;
  },

  notificationReceived: function(notification, payload, sender) {
    // Do nothing
  },

  socketNotificationReceived: function(notification, payload) {
    // Do nothing
  },

  getData: function() {
    var self = this;

    fetch("https://tilecache.rainviewer.com/api/maps.json")
      .then(response => response.json())
      .then(json => {
        const newTimestamps = json.slice(-self.config.maxFrames);
        for (var ts of newTimestamps) {
          if (!self.timestamps.includes(ts)) {
            self.timestamps.push(ts);
          }
        }

        if (self.animationTimer === null) {
          self.animationTimer = setInterval(() => self.advanceRadarFrame(), 500);
        }
      });

    if (self.config.showNHCData) {
      self.fetchNHCData();
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
    wrapper.style.width = cssLength(self.config.width);
    wrapper.style.height = cssLength(self.config.height);

    setTimeout(() => {
      self.map = L.map(wrapper).setView([self.config.latitude, self.config.longitude], self.config.zoom);

      self.baseLayer = L.geoJSON([], {
        pane: "tilePane",
        color: "#c0c0c0",
        weight: 1,
      }).addTo(self.map);

      fetch(self.getBaseLayerURL())
        .then(response => response.json())
        .then(json => {
          self.baseLayer.addData(json);
        });

      self.advisoryLayers = {};
      self.advisoryLayerGroup = L.layerGroup().addTo(self.map);

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
    return `/modules/MMM-RainViewer/proxy/${url}`;
  },

  getFeatureStyle: function(feature) {
    const forecastColors = {
      "LineString": "black",
      "Point": "black",
      "Polygon": "lightblue",
    };
    const defaultForecastColor = "blue";
    const outlookColors = {
      "Low": "yellow",
      "Medium": "orange",
      "High": "red",
    };
    const defaultOutlookColor = "yellow";
    let color;

    if ("RISK5DAY" in feature.properties) {
      color = outlookColors[feature.properties.RISK5DAY] || defaultOutlookColor;
    } else {
      color = forecastColors[feature.geometry.type] || defaultForecastColor;
    }

    return { color: color };
  },

  pointToLayer: function(feature, latlon) {
    return L.circleMarker(latlon, {
      opacity: 1,
      fillOpacity: 1,
      radius: 4,
    });
  },

  fetchNHCData: function() {
    let self = this;

    fetch(self.corsUrl("https://www.nhc.noaa.gov/gis-at.xml"))
      .then(response => response.text())
      .then(xml => new DOMParser().parseFromString(xml, "text/xml"))
      .then(rss => {
        for (let k in self.advisoryLayers) {
          self.advisoryLayers[k].active = false;
        }

        rss.querySelectorAll("item").forEach(item => {
          let title = item.querySelector("title").innerHTML;

          if (title.startsWith("Advisory")
              && (title.includes("Forecast [shp]") || title.includes("Wind Field [shp]"))) {
            self.addAdvisoryLayer(title, item.querySelector("link").innerHTML);
          }
        });

        Object.keys(self.advisoryLayers).forEach(k => {
          let layer = self.advisoryLayers[k];

          if (!layer.active) {
            self.map.removeLayer(layer.layer);
            delete self.advisoryLayers[k];
          }
        });
      });

      self.updateOutlookLayer();
  },

  addAdvisoryLayer: function(title, link) {
    let self = this;

    if (link in self.advisoryLayers) {
      self.advisoryLayers[link].active = true;
      return;
    }

    self.advisoryLayers[link] = {
      layer: null,
      active: true,
    };

    let filter = null;
    let polygonCount = 0;
    if (title.includes("Wind Field")) {
      filter = f => (f.geometry.type !== "Polygon" || ++polygonCount < 2);
    }

    fetch(self.corsUrl(link))
      .then(response => response.arrayBuffer())
      .then(buffer => {
        let layer = self.processShapefile(buffer, filter);
        layer.addTo(self.map);
        self.advisoryLayers[link].layer = layer;
      });
  },

  updateOutlookLayer: function() {
    let self = this;

    fetch(self.corsUrl("https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip"))
      .then(response => response.arrayBuffer())
      .then(buffer => {
        if (self.outlookLayer !== null) {
          self.map.removeLayer(self.outlookLayer);
        }
        self.outlookLayer = self.processShapefile(buffer, f => f.properties.BASIN === "Atlantic");
        self.outlookLayer.addTo(self.map);
      });
  },

  processShapefile: function(buffer, filter) {
    let self = this;
    let features = [];
    let collecting = true;
    let layer = new L.Shapefile(buffer, {
      filter: (feature) => {
        if (collecting) {
          features.push(feature);
        }
        return !collecting;
      },
      style: (feature) => self.getFeatureStyle(feature),
      pointToLayer: (feature, latlon) => { return self.pointToLayer(feature, latlon) },
    });

    layer.once("data:loaded", () => {
      features.sort((a, b) => {
        const weights = {
          "Polygon": 1,
          "LineString": 2,
          "Point": 3,
        };
        return (weights[a.geometry.type] || 4) - (weights[b.geometry.type] || 4);
      });

      collecting = false;
      features.forEach(feature => {
        if (!filter || filter(feature)) {
          layer.addData(feature);
        }
      });
      features = [];
    });

    return layer;
  },
});
