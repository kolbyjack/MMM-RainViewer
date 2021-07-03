# Module: MMM-RainViewer
The module displays an animated radar with a semitransparent background for the United States.

## Installation

In your terminal, go to your MagicMirror's Module folder:
````
cd ~/MagicMirror/modules
````

Clone this repository:
````
git clone https://github.com/kolbyjack/MMM-RainViewer.git
````

Configure the module in your `config.js` file.

**Note:** After starting the Mirror, it will take a few seconds before the radar appears.

## Using the module

To use this module, add it to the modules array in the `config/config.js` file:
````javascript
modules: [
  {
    module: "MMM-RainViewer",
    position: "top_right",
    config: { // See "Configuration options" for more information.
      latitude: 38.6247,
      longitude: -90.1848,
    }
  }
]
````

## Configuration options

The following properties can be configured:

|Option|Default|Description|
|---|---|---|
|`longitude`|`-81.0912`|Longitude of the center of the map.|
|`latitude`|`32.0809`|Latitude of the center of the map.|
|`zoom`|`6`|Zoom level of the map (lower zoom levels give a larger map).|
|`scheme`|`2`|[Color scheme](https://www.rainviewer.com/api/color-schemes.html) to use for the radar images.|
|`width`|`300`|Width of the map in pixels.|
|`height`|`300`|Height of the map in pixels.|
|`updateInterval`|`10 * 60 * 1000`|How often to fetch new radar data from RainViewer (do not set this any lower).|
|`maxFrames`|`10`|Maximum frames of radar images to animate.|
