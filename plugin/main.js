let websocket = null;
const buttons = new Map();
const sendWs = data => {
    if (websocket && websocket.readyState === 1) websocket.send(JSON.stringify(data));
};

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
    websocket = new WebSocket(`ws://localhost:${inPort}`);
    websocket.onopen = () => sendWs({event: inRegisterEvent, uuid: inPluginUUID});
    websocket.onclose = () => {
        buttons.forEach(b => clearInterval(b.timer));
        buttons.clear();
    };
    websocket.onmessage = evt => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch (err) { console.error(err); return; }
        const {event, context, payload} = msg;
        if (event === "willDisappear") {
            const b = buttons.get(context);
            if (b) clearInterval(b.timer);
            buttons.delete(context);
        } else if (event === "willAppear" || event === "didReceiveSettings") {
            configure(context, payload?.settings || {});
        } else if (event === "keyUp") {
            if (!buttons.has(context)) configure(context, payload?.settings || {});
            else refresh(context, buttons.get(context));
        }
    };
}

function configure(context, settings) {
    const previous = buttons.get(context);
    if (previous) clearInterval(previous.timer);
    const b = {
        city: String(settings.cityName || "").trim(),
        unit: settings.unit === "fahrenheit" ? "fahrenheit" : "celsius",
        round: settings.roundDegree !== false && settings.roundDegree !== "false",
        frequency: Number(settings.frequency) || 0,
        timer: null, busy: false
    };
    buttons.set(context, b);
    if ([600000, 1800000, 3600000].includes(b.frequency) && b.city) {
        b.timer = setInterval(() => refresh(context, b), b.frequency);
    }
    refresh(context, b);
}

function requestJSON(url) {
    return new Promise((resolve, reject) => {
        const req = new XMLHttpRequest();
        req.open("GET", url);
        req.timeout = 15000;
        req.onload = () => {
            if (req.status !== 200) return reject(new Error(`Weather request failed: HTTP ${req.status}`));
            try { resolve(JSON.parse(req.responseText)); } catch (err) { reject(err); }
        };
        req.onerror = () => reject(new Error("Weather network error"));
        req.ontimeout = () => reject(new Error("Weather request timed out"));
        req.onabort = () => reject(new Error("Weather request aborted"));
        req.send();
    });
}

async function refresh(context, b) {
    if (buttons.get(context) !== b || b.busy) return;
    if (!b.city) { sendWs({event: "showAlert", context}); return; }
    b.busy = true;
    try {
        const geo = await requestJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(b.city)}&count=1`);
        const location = geo.results?.[0];
        if (!location) throw new Error(`City not found: ${b.city}`);
        if (buttons.get(context) !== b) return;
        const {latitude, longitude, name} = location;
        const res = await requestJSON(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,is_day,weather_code&temperature_unit=${b.unit}`);
        if (!Number.isFinite(res.current?.temperature_2m)) throw new Error("Weather response has no temperature");
        if (buttons.get(context) !== b) return;
        const temperature = res.current.temperature_2m.toFixed(b.round ? 0 : 1) + (res.current_units?.temperature_2m || (b.unit === "fahrenheit" ? "°F" : "°C"));
        const image = await drawWeather(res, name || b.city, temperature);
        if (buttons.get(context) === b) sendWs({event: "setImage", context, payload: {image}});
    } catch (err) {
        console.error("Weather refresh failed:", err);
        if (buttons.get(context) === b) sendWs({event: "showAlert", context});
    } finally { b.busy = false; }
}

function loadIcon(url) {
    return new Promise(resolve => {
        const img = new Image();
        let finished = false;
        const finish = value => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            img.onload = img.onerror = null;
            resolve(value);
        };
        const timer = setTimeout(() => finish(null), 5000);
        img.crossOrigin = "anonymous";
        img.onload = () => finish(img);
        img.onerror = () => finish(null);
        img.src = url;
    });
}

async function drawWeather(response, city, temperature) {
    const code = response.current.weather_code;
    const isDay = response.current.is_day === 1;
    let icon = null;

    if (code === 0) icon = isDay ? "clear-day" : "clear-night";
    else if (code <= 2) icon = isDay ? "partly-cloudy-day" : "partly-cloudy-night";
    else if (code === 3) icon = "overcast";
    else if (code === 45 || code === 48) icon = "fog";
    else if (code <= 57) icon = "drizzle";
    else if (code <= 67) icon = "rain";
    else if (code <= 77) icon = "snow";
    else if (code <= 82) icon = "rain-showers";
    else if (code <= 86) icon = "snow-showers";
    else if (code <= 99) icon = isDay ? "thunderstorms-day" : "thunderstorms-night";

    const url = icon ? `https://raw.githubusercontent.com/basmilius/meteocons/v2/production/fill/png/128/${icon}.png` : null;
    // Render text even when the remote icon is unavailable or taints the canvas.
    const img = url ? await loadIcon(url) : null;
    function render(withIcon) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#101820";
        ctx.fillRect(0, 0, 128, 128);
        if (withIcon) ctx.drawImage(img, 5, 10, 118, 108);
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = "small-caps bold 15px Arial";
        ctx.fillText(city, 64, 23, 120);
        ctx.font = "bold 20px Arial";
        ctx.fillText(temperature, 64, 120, 120);
        return canvas.toDataURL();
    }
    try { return render(!!img); } catch (err) { return render(false); }
}
