let websocket = null, pluginUUID = null;
const buttons = [];
const sendWs = (data) => websocket.send(JSON.stringify(data));

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
    pluginUUID = inPluginUUID;
    websocket = new WebSocket(`ws://localhost:${inPort}`);

    websocket.onopen = () => sendWs({event: inRegisterEvent, uuid: inPluginUUID});

    websocket.onmessage = (evt) => {
        const jsonObj = JSON.parse(evt.data);
        const {event, context, payload} = jsonObj;

        if (event === "willAppear") buttons.push({context, jsonObj});
        if (event === "keyUp" || event === "didReceiveSettings") getWeather(jsonObj, context); else if (event === "didReceiveGlobalSettings" && payload?.settings) {
            buttons.forEach(b => {
                if (Object.keys(b.jsonObj.payload?.settings || {}).length > 0) getWeather(b.jsonObj, b.context);
            });
        }
    };
}

function getWeather(jsonObj, context) {
    const s = jsonObj.payload?.settings;
    const valid = s && ["cityName", "unit", "frequency", "roundDegree"].every(k => k in s);

    const cityName = valid ? s.cityName.toLowerCase() : "";
    const unit = valid ? s.unit : "";
    const roundDegree = valid ? s.roundDegree === "true" : true;
    const frequency = valid && s.frequency !== "0" ? parseInt(s.frequency) : false;

    if (!cityName) {
        sendWs({event: "showAlert", context: jsonObj.context});
    } else {
        sendRequest(context, cityName, unit, roundDegree);
        if (frequency) setInterval(() => sendRequest(context, cityName, unit, roundDegree), frequency);
    }
}

function geocoding(cityName, callback) {
    const req = new XMLHttpRequest();
    req.open("GET", `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`);
    req.onload = () => {
        if (req.status === 200) {
            const res = JSON.parse(req.responseText);
            res.results?.[0] ? callback(res.results[0]) : console.error("City not found.");
        } else console.error("Request failed:", req.status);
    };
    req.send();
}

function setButton(response, context, city, temperature) {
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

    const defaultImg = "https://raw.githubusercontent.com/Lyzev/streamDeck-weatherPlugin/master/Sources/dev.lyzev.sdPlugin/resources/actionIcon.png";
    const url = icon ? `https://raw.githubusercontent.com/basmilius/meteocons/v2/production/fill/png/128/${icon}.png` : defaultImg;

    dataFromCanvasDraw(url, city, temperature, (dataUrl) => sendWs({event: "setImage", context, payload: {image: dataUrl}}));
    return url;
}

function sendRequest(context, cityName, unit, roundDegree) {
    geocoding(cityName, ({latitude, longitude, name}) => {
        const req = new XMLHttpRequest();
        req.open("GET", `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m&temperature_unit=${unit}`);
        req.onload = () => {
            if (req.status === 200) {
                const res = JSON.parse(req.responseText);
                setButton(res, context, name, res.current?.temperature_2m != null ? res.current.temperature_2m.toFixed(roundDegree ? 0 : 1) + res.current_units.temperature_2m : "NaN");
            } else sendWs({event: "showAlert", context});
        };
        req.send();
    });
}

function dataFromCanvasDraw(url, city, temperature, callback) {
    const canvas = document.getElementById("idCanvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, img.width, img.height, 5, 10, canvas.width - 10, canvas.height - 20);
        ctx.font = "small-caps bold 15px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText(city, canvas.width / 2, 23);
        ctx.font = "bold 20px Arial";
        ctx.fillText(temperature, canvas.width / 2, canvas.height - 8);
        callback(canvas.toDataURL());
    };
    img.src = url;
}