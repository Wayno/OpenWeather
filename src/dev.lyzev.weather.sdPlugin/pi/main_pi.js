let websocket = null, uuid = null, actionInfo = {};

function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {
    uuid = inPropertyInspectorUUID;
    actionInfo = JSON.parse(inActionInfo);
    websocket = new WebSocket("ws://localhost:" + inPort);
    websocket.onopen = function () {
        let json = {
            event: inRegisterEvent, uuid: inPropertyInspectorUUID,
        };
        websocket.send(JSON.stringify(json));
        json = {
            event: "getSettings", context: uuid,
        };
        websocket.send(JSON.stringify(json));
    };
    websocket.onmessage = function (evt) {
        const jsonObj = JSON.parse(evt.data);
        if (jsonObj.event === "didReceiveSettings") {
            const payload = jsonObj.payload.settings;
            initiateElement("cityName", payload.cityName);
            initiateElement("frequency", payload.frequency, 0);
            initiateElement("unit", payload.unit, "celsius");
            initiateElement("roundDegree", payload.roundDegree, "true");
            const el = document.querySelector(".sdpi-wrapper");
            el && el.classList.remove("hidden");
        }
    };
}

function initiateElement(element, value, fallback = "") {
    if (typeof value === "undefined") {
        document.getElementById(element).value = fallback;
        return;
    }
    document.getElementById(element).value = value;
}

function updateSettings() {
    if (websocket && websocket.readyState === 1) {
        let payload = {};
        payload.cityName = document.getElementById("cityName").value;
        payload.frequency = document.getElementById("frequency").value;
        payload.unit = document.getElementById("unit").value;
        payload.roundDegree = document.getElementById("roundDegree").value;
        const json = {
            event: "setSettings", context: uuid, payload: payload,
        };
        websocket.send(JSON.stringify(json));
    }
}

function openPage(site) {
    if (websocket && websocket.readyState === 1) {
        const json = {
            event: "openUrl", payload: {
                url: `https://${site}`,
            },
        };
        websocket.send(JSON.stringify(json));
    }
}