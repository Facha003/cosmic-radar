# Tonight's Sky Atlas

A simple phone-first stargazing page: which constellations are up tonight where you are, an all-sky chart, star facts, the Moon and a cloud forecast.

```
index.html      page markup
css/style.css   styles (dark night theme, red-light mode)
js/data.js      bright stars, constellation lines and myths, star facts, city list
js/astro.js     astronomy math: sidereal time, alt/az, Sun, Moon, dark window
js/compass.js   phone compass heading (smoothed)
js/app.js       location, weather (Open-Meteo), "up now" list, compass finder, sky map
```

No build step and no dependencies. Serve the folder over HTTPS (or `localhost`) so the browser can ask for your location:

```
python3 -m http.server
```
