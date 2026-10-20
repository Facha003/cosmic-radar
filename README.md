# Cosmic Radar

A phone-first sky app with two radars. Live at https://facha003.github.io/cosmic-radar/

- **Cosmic Radar** scans the sky above you for planets, stars, constellations and satellites. Tap a blip to see what it is, how far away it is, whether it's visible tonight and which way to look.
- **Aurora Radar** estimates your chance of seeing the northern (or southern) lights from the aurora forecast, cloud cover and darkness, and suggests nearby places to watch from.

```
index.html      page markup
css/style.css   styles (radar theme, red-light mode)
js/data.js      stars, constellations, famous sights, planets, meteor showers, eclipses, cities
js/astro.js     astronomy math: sidereal time, alt/az, Sun, Moon, planets, dark window
js/compass.js   phone compass heading (smoothed)
js/sats.js      bright satellites (CelesTrak orbits, satellite.js), sunlight and visible passes
js/events.js    special things tonight: aurora outlook, ISS passes, meteor showers, eclipses, close pairings, Moon phase
js/radar.js     the radar scope drawing and the Cosmic Radar blips
js/aurora.js    Aurora Radar: chance score, NOAA aurora map, Kp chart, viewing spots
js/app.js       location, tabs, weather, info card, compass finder, startup
```

Live data: cloud cover from Open-Meteo, Kp forecast and aurora map from NOAA SWPC, satellite orbits from CelesTrak, places from OpenStreetMap via Photon. Everything else is calculated on the device.

Check the astronomy math against known sky events (also runs on every push):

```
node tests/astro.test.mjs
```

No build step. Serve the folder over HTTPS (or `localhost`) so the browser can ask for your location:

```
python3 -m http.server
```
