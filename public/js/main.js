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

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const userMappers = {
    ".user_displayName": u => u.displayName,
    ".user_email": u => u.email
};

document.querySelector("#sign-in")?.addEventListener("click", () => signInWithPopup(auth, provider));
document.querySelector("#sign-out")?.addEventListener("click", () => signOut(auth));

window.addEventListener("hashchange", identifyRoute);
identifyRoute();

function identifyRoute() {

    const route = location.hash.replace("#", "");
    const routeClass = route ? `route-${route}` : null;
    const classes = document.body.classList;
    Array.from(classes).filter(x => x.startsWith("route") && x !== routeClass).forEach(x => classes.remove(x));
    if (routeClass && !classes.contains(routeClass))
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

        const functions = getFunctions(app);
        const fetchUserConfig = httpsCallable(functions, "fetchUserConfig");
        const { data: userConfig } = await fetchUserConfig({ includeTesting: true });

        Array.from(classes).filter(c => c.startsWith("license-")).forEach(l => classes.remove(l));
        classes.add(`license-${userConfig.license}`);

        document.querySelector(".user_capacity").textContent = [
            (!userConfig.free) && `${userConfig.licenseName} license`,
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