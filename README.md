# Cosmic Radar

A sky app built for phones, with two radars. Live at https://facha003.github.io/cosmic-radar/

**Cosmic Radar** scans the sky above you for planets, stars, constellations and satellites. Tap a blip to see what it is, how far away it is, whether it's visible tonight and which way to face. On a phone, the radar turns with you like a compass.

**Aurora Radar** estimates your chance of seeing the northern (or southern) lights from the NOAA aurora forecast, cloud cover, darkness and the Moon, and suggests nearby places to watch from.

## Why I built it

Star maps show you the whole sky, but they don't tell you where to actually look. I wanted something that works like a radar or sonar: you stand outside, hold up your phone, and it points you to the thing you want to see.

## How I built it with AI

I built the whole app with Claude Code on my Mac. I described what I wanted in plain language, tested each version on my phone, and asked for changes. Commits made with AI help have a `Co-Authored-By` line.

### How the idea changed

1. **Tonight's Sky Atlas** (first version, 20 Oct): a list of constellations visible tonight, a sky chart, star facts, the Moon and a cloud forecast.
2. **Compass finder:** a simpler phone view that tells you which way to face and how high to look.
3. **Famous sights instead of whole constellations:** things people actually recognise, like the Big Dipper and the Pleiades, listed first.
4. **Planets, northern lights and special events:** meteor showers, ISS passes, eclipses and close pairings.
5. **Rebuilt around two radars:** a map is hard to match with the real sky. A radar centered on you, with the top pointing where your phone points, makes it much easier to pinpoint where something is.
6. **Better aurora estimates for Norway and the north,** and the Aurora Radar turning with the phone too.
7. **A real sweep display:** targets light up when the beam passes and fade afterwards.
8. **Automatic tests** on every push (GitHub Actions).
9. **A review round** that found and fixed the problems below.

### Problems along the way

- **Location blocked inside claude.ai.** Claude Code also published a copy as a claude.ai artifact, but browsers block location access inside it. I moved the real app to GitHub Pages, and the claude.ai copy now links there.
- **Overconfident sky verdict.** When the cloud forecast failed to load, the app still said "Great night for stars". Missing data should never give an optimistic answer, especially in Oslo in October. I moved the scoring into its own function (`skyVerdict` in `js/astro.js`) so it could be tested, and now it says "Dark enough, clouds unknown" instead. The Aurora Radar also says when it's guessing the clouds.
- **A fix that broke something else.** Radar labels were running over the edge of the scope, so I had the AI keep them inside. That fix hid the names of planets close to the horizon: near the north or south edge, a planet had to be about 13° up before its name showed. From Oslo, planets are often low in the south, so that hid the most useful labels. I fixed it so labels try four positions, and planets and the Moon always keep their name. I checked it by rendering test planets 1 to 3° above the horizon at the north and south edges.
- **Tests that check themselves.** The aurora Kp thresholds (Oslo about 4, Tromsø about 1) were tuned by hand, and the tests check those same numbers. They're labelled as regression checks in the test file, not real validation.

## How I tested it

- **Automated:** `tests/astro.test.mjs` checks the astronomy math against real sky events: Saturn and Jupiter at opposition, Venus passing the Sun, the full Moon on 26 Oct 2026, Polaris altitude matching latitude in Oslo, New York and Sydney, and when Oslo gets dark. It also checks the sky verdict, including the missing forecast case. Runs on every push.
- **Outside at night:** tested on my phone outside in the Oslo area.
- **Without internet:** loaded the app, turned on airplane mode, and it showed "couldn't load" messages and a retry button instead of crashing.

```
node tests/astro.test.mjs
```

## Limits

- Positions use simplified formulas, accurate to around a degree. Fine for the naked eye, not for telescopes.
- The aurora percentage is my own estimate, not an official forecast.
- The compass only works on phones and depends on the phone's sensor calibration.

## Files

```
index.html      page markup
css/style.css   styles (radar theme, red light mode)
js/data.js      stars, constellations, famous sights, planets, meteor showers, eclipses, cities
js/astro.js     astronomy math: sidereal time, alt/az, Sun, Moon, planets, dark window, sky verdict
js/compass.js   phone compass heading (smoothed)
js/sats.js      bright satellites (CelesTrak orbits, satellite.js), sunlight and visible passes
js/events.js    special things tonight: aurora outlook, ISS passes, meteor showers, eclipses, close pairings, Moon phase
js/radar.js     the radar scope drawing and the Cosmic Radar blips
js/aurora.js    Aurora Radar: chance score, NOAA aurora map, Kp chart, viewing spots
js/app.js       location, tabs, weather, info card, compass finder, startup
```

Live data: cloud cover from Open-Meteo, Kp forecast and aurora map from NOAA SWPC, satellite orbits from CelesTrak, places from OpenStreetMap via Photon (or Nominatim when Photon is down). No API keys. Everything else is calculated on the device, and your location is only sent, rounded to about 100 m, to the cloud and place-search services.

To run it locally, serve the folder over HTTPS or `localhost` so the browser can ask for your location:

```
python3 -m http.server
```
