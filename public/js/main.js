import * as firebase from "./lib/firebase.js";
const {
    initializeApp,
    auth: { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut },
    functions: { getFunctions, httpsCallable }
} = firebase;

const app = initializeApp({
    apiKey: "AIzaSyDsCDmNd_nOxXySkItzcqH_htRHl-KpDrQ",
    authDomain: "firestripe-jojo.firebaseapp.com",
    projectId: "firestripe-jojo",
    storageBucket: "firestripe-jojo.appspot.com",
    messagingSenderId: "252743869196",
    appId: "1:252743869196:web:337ae4e11994e20a319f29"
});

const functions = getFunctions(app);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const userMappers = {
    ".user_displayName": u => u.displayName,
    ".user_email": u => u.email
};

document.querySelector("#sign-in")?.addEventListener("click", () => signInWithPopup(auth, provider));
document.querySelector("#sign-out")?.addEventListener("click", () => signOut(auth));
document.querySelector("#replay-all-events")?.addEventListener("click", e => replayEventDatabase(e));
window.addEventListener("hashchange", identifyRoute);
identifyRoute();

async function replayEventDatabase(e) {

    e.target.setAttribute("disabled", "");
    try {
        const result = await httpsCallable(functions, "replayEventDatabase")();
        console.log(result);
        alert(result?.data);
    } catch (err) {
        alert(err.stack);
    } finally {
        e.target.removeAttribute("disabled");
    }

}

function identifyRoute() {

    const route = location.hash.replace("#", "");
    const routeClass = route ? `route-${route}` : "route-home";
    const classes = document.body.classList;
    Array.from(classes).filter(x => x.startsWith("route") && x !== routeClass).forEach(x => classes.remove(x));
    if (!classes.contains(routeClass))
        classes.add(routeClass);

}
onAuthStateChanged(auth, async user => {

    const classes = document.body.classList;
    if (user) {

        Object.entries(userMappers).map(([selector, access]) => {
            for (const el of document.querySelectorAll(selector))
                el.textContent = access(user);
        });
        while (!classes.contains("authenticated"))
            classes.add("authenticated");

        document.querySelector("stripe-pricing-table")?.setAttribute("client-reference-id", user?.uid);

        const { data: userConfig } = await httpsCallable(functions, "fetchUserConfig")({ includeTesting: true });

        Array.from(classes).filter(c => c.startsWith("license-")).forEach(l => classes.remove(l));
        classes.add(`license-${userConfig.license}`);

        document.querySelector(".user_capacity").textContent = [
            userConfig.free ? "Free account" : `${userConfig.licenseName} license`,
            `Up to ${userConfig.widgets} widgets`,
            userConfig.seats > 1 && `${userConfig.seats} seats`,
            userConfig.teams && `Team fidgets and widgets`
        ].filter(x => x).join(". ");

    } else {

        document.querySelector(".user_capacity").textContent = "Loading...";
        Array.from(classes).filter(c => c.startsWith("license-")).forEach(l => classes.remove(l));
        while (classes.contains("authenticated"))
            classes.remove("authenticated");
    }

});