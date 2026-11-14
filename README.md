# La Terre

An interactive teaching site about the Earth, in French and English, meant as classroom support. It is a single page and depends on no outside service: the imagery, the relief and the places are all in the repository.

Four views:

- **3D Globe**: a globe to explore in the manner of Google Earth. Satellite imagery down to 1 km per pixel, 3D relief, borders, place names, search across 484,000 places, distance measurement, day and night at any date and time, twelve places with a short commentary.
- **Day and night**: a five-step lesson that drives the globe to explain why there is day, then night. Rotation axis, view tilted by 23.4°, a city to follow, adjustable date and speed.
- **Time zones**: a five-step lesson on why the time differs from one country to another. Theoretical 15° zones, real zones coloured on the globe, the time difference between two cities, the International Date Line.
- **Seasons**: a simulation of the orbit and the axial tilt, with day length and solar energy received by latitude.

## Running the site

You need Python 3 and nothing else:

```
python3 tools/serve.py
```

then open http://localhost:8000/. Pass another port as an argument (`python3 tools/serve.py 8080`).

Opening `index.html` straight from disk does not work: the browser then refuses to load the imagery and the data.

`index.html` deliberately has no `<!doctype>` and no `<html>` tag: the page is also published as an artifact on claude.ai, which adds that wrapper. `tools/serve.py` adds it the same way locally. With another file server the site still works, but the browser renders it in quirks mode.

## Browser requirements

- The globe uses WebGL 2, or WebGL 1 if that is unavailable.
- Without WebGL (graphics acceleration turned off, for example), it falls back to a renderer computed on the processor: same imagery and same tools, but no 3D relief.
- The layers panel offers three levels of detail, from "Light" (under 10 MB to load) to "Full" (up to 110 MB).
- Settings are remembered in the browser (`localStorage`).

## Repository layout

| Path | Contents |
|---|---|
| `index.html` | The page: navigation, the three views, styles, Seasons view |
| `globe.js` | The globe and the "Day and night" and "Time zones" lessons |
| `tiles/` | Daytime imagery at four levels of detail, night lights |
| `data/` | Relief, coastlines and borders, places, time zones |
| `tools/build_assets.py` | Rebuilds `tiles/` and `data/` from the public sources |
| `tools/serve.py` | Local server |

The code comments and the build script messages are in French.

## Rebuilding the imagery and the data

`tiles/` and `data/` are already in the repository. To rebuild them:

```
python3 -m venv venv
venv/bin/pip install pillow numpy
venv/bin/python tools/build_assets.py <cache_dir> .
```

The script downloads about 1 GB into the cache directory (650 MB of it for GeoNames) and does not repeat downloads that are already there.

## Credits and data licenses

The files in `tiles/` and `data/` are derived from the sources below and remain under their terms. The project's MIT license does not apply to them.

| Files | Source | Terms |
|---|---|---|
| `tiles/0` to `tiles/3` | NASA Blue Marble (shaded relief and bathymetry), NASA Earth Observatory, obtained through the GIBS service | NASA data, not copyrighted; credit requested |
| `tiles/night.jpg` | NASA Black Marble 2016: NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román (NASA GSFC), obtained through the GIBS service | NASA data, not copyrighted; credit requested |
| `data/elev.png` | ETOPO2v2, NOAA National Geophysical Data Center, 2006 | Public domain (U.S. government) |
| `data/lines.json` | Natural Earth (coastlines, borders, lakes at 1:50,000,000) | Public domain |
| `data/places.json` | Natural Earth (countries, major cities) and GeoNames (other places, provinces and states, French and English names) | Natural Earth: public domain. GeoNames: CC BY 4.0 |
| `data/places-small.json`, `data/places-tiny.json`, `data/places-hamlets.json` | GeoNames | CC BY 4.0 |
| `data/tz.png` | Time zone boundaries from timezone-boundary-builder (release 2026f), derived from OpenStreetMap; UTC offsets from the IANA time zone database | Boundaries: © OpenStreetMap contributors, Open Database License (ODbL). IANA database: public domain |

Acknowledgments requested by the sources:

- We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS): https://earthdata.nasa.gov/gibs
- Made with Natural Earth: https://www.naturalearthdata.com
- Time zone boundaries © OpenStreetMap contributors, available under the Open Database License: https://www.openstreetmap.org/copyright and https://github.com/evansiroky/timezone-boundary-builder
- GeoNames, licensed under Creative Commons Attribution 4.0: https://www.geonames.org and https://creativecommons.org/licenses/by/4.0/

The page also loads two typefaces from Google Fonts, Bricolage Grotesque and Instrument Sans, under the SIL Open Font License. They are not in the repository.

## Known limits

- Imagery stops at 1 km per pixel: a mountain range or a delta is recognizable, a city is not.
- The relief is smoothed to 14 km: displayed elevations are approximate and summits are flattened.
- Borders are indicative.
- Time zones show normal legal time, without daylight saving time. For China the single official time (UTC+8) is used.
- GeoNames does not know the population of most hamlets: only places with a recorded population are included, and coverage is very uneven from one country to another.

## License

The project's code and texts (`index.html`, `globe.js`, `tools/`) are under the MIT license: see [LICENSE](LICENSE). The imagery and the data remain under the terms of their sources, detailed above.
