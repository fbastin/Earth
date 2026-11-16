# Earth

An interactive teaching site about the Earth, in French and English, meant as classroom support. It is a single page and depends on no outside service: the imagery, the relief, the places and the typefaces are all in the repository.

Five views:

- **3D Globe**: a globe to explore in the manner of Google Earth. Satellite imagery down to 1 km per pixel, 3D relief, borders, place names, search across 484,000 places, distance measurement, day and night at any date and time, twelve places with a short commentary.
- **Day and night**: a five-step lesson that drives the globe to explain why there is day, then night. Rotation axis with an adjustable tilt (0 to 90°), a city to follow with its day length, adjustable date and speed.
- **Time zones**: a five-step lesson on why the time differs from one country to another. Theoretical 15° zones, real zones coloured on the globe, the time difference between two cities, the International Date Line.
- **Population**: every country coloured on the globe from 1950 to 2050, by population, population growth or GDP per capita, with the path of each country and an 80% range for the projected years. Four more indicators, observed only, run from 1950 to the latest year available: children per woman, life expectancy, CO₂ emissions per capita and urban population. Four steps explain the growth of the world population, its unevenness, why a projection comes with a range, and GDP per capita.
- **Seasons**: a simulation of the orbit and the axial tilt, with day length and solar energy received by latitude.

## Running the site

You need Python 3 and nothing else:

```
python3 tools/serve.py
```

then open http://localhost:8000/. Pass another port as an argument (`python3 tools/serve.py 8080`).

Opening `index.html` straight from disk does not work: the browser then refuses to load the imagery and the data.

`index.html` deliberately has no `<!doctype>` and no `<html>` tag: the page is also published as an artifact on claude.ai, which adds that wrapper. `tools/serve.py` adds it the same way locally. With another file server the site still works, but the browser renders it in quirks mode.

## Installing on a web server

The site is static. `tools/deploy.py` copies it into a folder served by any web server and writes the complete `index.html` there (with the `<!doctype>` wrapper the repository file leaves out):

```
python3 tools/deploy.py /var/www/example/earth
```

Run it again after a `git pull`: only the files that changed are rewritten, and nothing is deleted. Three options, used together, add a link back to the hosting site at the top of the page: `--back-url` (where `{lang}` becomes `fr` or `en`), `--back-fr` and `--back-en` (the link text in each language). If the server already wraps the page itself when serving it, pass `--no-wrap` instead: `index.html` is then installed without the wrapper.

To keep the data of an installed site current without touching the repository, point the two update scripts at the folder, for instance from a monthly scheduled task:

```
python3 tools/update_population.py --out /var/www/example/earth
python3 tools/update_indicators.py --out /var/www/example/earth
```

`deploy.py` never replaces these two data files with an older copy from the repository.

## Browser requirements

- The globe uses WebGL 2, or WebGL 1 if that is unavailable.
- Without WebGL (graphics acceleration turned off, for example), it falls back to a renderer computed on the processor: same imagery and same tools, but no 3D relief.
- The layers panel offers three levels of detail, from "Light" (under 10 MB to load) to "Full" (up to 110 MB).
- Settings are remembered in the browser (`localStorage`).

## Repository layout

| Path | Contents |
|---|---|
| `index.html` | The page: navigation, the views, styles, Seasons view |
| `globe.js` | The globe, the "Day and night" and "Time zones" lessons, the Population view |
| `tiles/` | Daytime imagery at four levels of detail, night lights |
| `fonts/` | The two typefaces of the page and their licenses |
| `data/` | Relief, coastlines and borders, places, time zones, country map, population and GDP, other indicators |
| `tools/build_assets.py` | Rebuilds `tiles/` and `data/` from the public sources |
| `tools/update_population.py` | Refreshes `data/population.json` from the pib-mondial repository |
| `tools/update_indicators.py` | Refreshes `data/indicateurs.json` from Our World in Data |
| `tools/deploy.py` | Installs or updates the site in a folder served by a web server |
| `tools/serve.py` | Local server |
| `tests/` | Automated tests |

The code comments and the build script messages are in French.

## Tests

```
python3 -m unittest discover -s tests
```

The tests need Python 3.8 or later and nothing else to install. They take about two minutes and cover three things:

- `tests/test_donnees.py`: the files shipped with the site. Shape of the data, tiles announced by `tiles/levels.json`, files the page refers to, nothing loaded from another site.
- `tests/test_outils.py`: the scripts in `tools/`, run in temporary folders against fake sources. They touch neither the repository nor the network.
- `tests/test_page.py`: the page itself in a headless Chrome. Loading, the five views in both languages, search, playback, saved choices, network failures and recovery, narrow and touch screens, loss of the 3D context, a browser without WebGL. Any exception, console error or missing file fails the test that caused it.

The page tests look for Chrome in the `CHROME` environment variable, then in the Playwright cache, then under its usual command names (`chromium`, `google-chrome`…). Without a browser they are skipped and the run says so. They run on Linux and macOS (on Windows, under WSL).

GitHub runs the whole suite on every push and pull request (`.github/workflows/tests.yml`); there, a missing browser is an error rather than a skip.

To run only the first two files, which take two seconds:

```
python3 -m unittest tests/test_donnees.py tests/test_outils.py
```

## Rebuilding the imagery and the data

`tiles/` and `data/` are already in the repository. To rebuild them:

```
python3 -m venv venv
venv/bin/pip install pillow numpy
venv/bin/python tools/build_assets.py <cache_dir> .
```

The script downloads about 1 GB into the cache directory (650 MB of it for GeoNames) and does not repeat downloads that are already there.

## Population and GDP data

The figures of the Population view come from a separate project, [pib-mondial](https://github.com/fbastin/pib-mondial), which collects them from the United Nations, the World Bank, the IMF and the OECD, and computes the ranges from the past errors of the projections. It publishes them as one file, `export/terre.json`.

- `data/population.json` is a copy of that file, so the view works offline.
- On every load, the page also asks GitHub for the current file and uses whichever of the two is more recent. The footer of the view says which one is shown and its date. When GitHub cannot be reached, the copy is used and nothing is reported. That is always the case for the page published as an artifact on claude.ai, which may not query another site.
- To refresh the copy after pib-mondial has been updated (the IMF publishes in April and October): `python3 tools/update_population.py`.

## Other indicators

Children per woman, life expectancy, CO₂ emissions per capita and urban population come from [Our World in Data](https://ourworldindata.org). `tools/update_indicators.py` downloads each chart's data and metadata, keeps the years from 1950 and the countries of the map, and writes them to `data/indicateurs.json`. The page only reads that copy: it never contacts Our World in Data.

- To refresh the copy: `python3 tools/update_indicators.py`. The script prints the license of every underlying source; check that they are still open before publishing.
- To add an indicator: one line in `INDICATEURS` in the script, then its colours, thresholds and texts in `globe.js` (see the comment above `xData`) and a button in `index.html`.

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
| `data/pays.png`, `data/pays.json` | Natural Earth (countries at 1:50,000,000) | Public domain |
| `data/population.json` | Population: United Nations, World Population Prospects 2024. GDP per capita: World Bank (World Development Indicators), IMF (World Economic Outlook, October 2026), OECD (long-term scenario, Economic Outlook 117). Ranges: pib-mondial | UN: CC BY 3.0 IGO. World Bank: CC BY 4.0. OECD: CC BY 4.0 under the OECD terms and conditions (content published since 1 July 2024). IMF: not an open licence; the IMF's terms allow copying, derivative works and redistribution with attribution, and require its permission for commercial reuse |
| `data/indicateurs.json` | Our World in Data, from: United Nations, World Population Prospects 2024 (children per woman, life expectancy); United Nations, World Urbanization Prospects 2025 (urban population); Global Carbon Project, Global Carbon Budget (CO₂ emissions), divided by Our World in Data's population series | Our World in Data: CC BY 4.0. UN: CC BY 3.0 IGO. Global Carbon Project: CC BY 4.0. The charts' older sources (before 1950) are not used |
| `data/tz.png` | Time zone boundaries from timezone-boundary-builder (release 2026f), derived from OpenStreetMap; UTC offsets from the IANA time zone database | Boundaries: © OpenStreetMap contributors, Open Database License (ODbL). IANA database: public domain |

Acknowledgments requested by the sources:

- We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS): https://earthdata.nasa.gov/gibs
- Made with Natural Earth: https://www.naturalearthdata.com
- Time zone boundaries © OpenStreetMap contributors, available under the Open Database License: https://www.openstreetmap.org/copyright and https://github.com/evansiroky/timezone-boundary-builder
- GeoNames, licensed under Creative Commons Attribution 4.0: https://www.geonames.org and https://creativecommons.org/licenses/by/4.0/
- United Nations, Department of Economic and Social Affairs, Population Division (2024). World Population Prospects 2024, Online Edition. Licensed under CC BY 3.0 IGO: https://population.un.org/wpp/ and https://creativecommons.org/licenses/by/3.0/igo/
- World Bank, World Development Indicators, licensed under CC BY 4.0: https://datacatalog.worldbank.org/search/dataset/0037712/World-Development-Indicators
- Source: International Monetary Fund, World Economic Outlook Database, October 2026, https://www.imf.org/en/Publications/WEO
- OECD (2025), OECD Economic Outlook No. 117, long-term baseline projections, https://www.oecd.org/en/topics/economic-outlook.html
- Our World in Data, https://ourworldindata.org, licensed under CC BY 4.0: charts "Fertility rate: births per woman", "Life expectancy", "CO₂ emissions per capita" and "Share of population living in urban areas"
- Global Carbon Project, Global Carbon Budget, licensed under CC BY 4.0: https://globalcarbonbudget.org
- United Nations, Department of Economic and Social Affairs, Population Division (2025). World Urbanization Prospects 2025. Licensed under CC BY 3.0 IGO

The GDP figures are not those sources' figures as published: pib-mondial splices the World Bank levels with the growth rates of the IMF forecasts and of the OECD scenario, converts them to purchasing power parity, and computes the ranges. None of these organisations endorses the result. Anyone reusing `data/population.json` commercially needs the IMF's permission for the part derived from its data (copyright@imf.org).

The two typefaces of the page, Bricolage Grotesque and Instrument Sans, are in `fonts/` (Latin and Latin Extended subsets, as served by Google Fonts). They are under the SIL Open Font License 1.1: see `fonts/OFL-BricolageGrotesque.txt` and `fonts/OFL-InstrumentSans.txt`. When the page is published as an artifact, `fonts/` has to be published with it, like `data/` and `tiles/`.

## Known limits

- Imagery stops at 1 km per pixel: a mountain range or a delta is recognizable, a city is not.
- The relief is smoothed to 14 km: displayed elevations are approximate and summits are flattened.
- Borders are indicative.
- Time zones show normal legal time, without daylight saving time. For China the single official time (UTC+8) is used.
- Population and GDP figures after the last observed year are projections. Their ranges come from past projection errors and assume the future errs no more than the past. Borders are those of today for every year: countries that no longer exist (USSR, Yugoslavia) appear as their successors.
- The four Our World in Data indicators are observed values only: no projection, no range, and they stop in 2023 or 2025. CO₂ emissions are missing for some small territories. Urban population follows each country's own definition of a town.
- GeoNames does not know the population of most hamlets: only places with a recorded population are included, and coverage is very uneven from one country to another.

## License

The project's code and texts (`index.html`, `globe.js`, `tools/`) are under the MIT license: see [LICENSE](LICENSE). The imagery, the data and the typefaces remain under the terms of their sources, detailed above.
