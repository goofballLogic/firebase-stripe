export * as auth from "https://www.gstatic.com/firebasejs/9.14.0/firebase-auth.js";
export * as functions from "https://www.gstatic.com/firebasejs/9.14.0/firebase-functions.js";

import { initializeApp as firebaseInitializeApp } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-app.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/9.14.0/firebase-functions.js";

export function initializeApp(config) {

    const app = firebaseInitializeApp(config);
    if (location.hostname === "localhost") {

        console.log("Connecting functions emulator");
        const functions = getFunctions(app);
        connectFunctionsEmulator(functions, "localhost", 5001);

    }
    return app;

}
