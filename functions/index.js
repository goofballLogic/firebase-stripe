// deps
const functions = require("firebase-functions");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getActiveSubscriptions, replayEvents, processStripeEvent, freshenAccountEvents } = require("./stripe-integration");
const { calculateEntitlements, FREE } = require("./product-entitlements");
const { defineSecret } = require('firebase-functions/params');
const { getAuth } = require("firebase-admin/auth");

// firestore
const firestore = getFirestore(initializeApp());

// config
const stripeAPIKey = defineSecret("STRIPE_API_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// stripe integration
const stripeIntegrationConfig = {

    key: stripeAPIKey,
    secret: stripeWebhookSecret,
    events: firestore.collection("stripe-events"),
    customers: firestore.collection("stripe-customers"),
    products: firestore.collection("stripe-products"),
    errors: firestore.collection("stripe-event-errors"),
    accounts: firestore.collection("accounts"),
    logger: functions.logger

};

const isAdmin = async ({ uid }) => (await getAuth().getUser(uid))?.customClaims?.admin;

// incoming webhook
exports.stripeWebhook = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onRequest(async (request, response) => {
        try {
            await processStripeEvent({ request, ...stripeIntegrationConfig });
            response.send("stripeWebhook: Ok");
        } catch (err) {
            functions.logger.warn(err);
            const code = err.type ? 400 : 500;
            response.status(code).send("stripeWebhook: Invalid request");
        }

    });

exports.replayEventDatabase = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onCall(async (_, context) => {

        if (!await isAdmin(context.auth))
            return new functions.https.HttpsError("permission-denied", "Admin only");
        const start = Date.now();
        await replayEvents({ ...stripeIntegrationConfig });
        return `Ok. ${Date.now() - start}ms.`;

    });

exports.searchLicenses = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onCall(async (_, context) => {

        const { uid } = context.auth || {};
        const currentSubs = await getActiveSubscriptions({ account: uid, ...stripeIntegrationConfig });
        await freshenAccountEvents({ account: uid, ...stripeIntegrationConfig });
        const newSubs = await getActiveSubscriptions({ account: uid, ...stripeIntegrationConfig });
        return {
            found: newSubs.length - currentSubs.length
        };

    });

// fetch config for user
exports.fetchUserConfig = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onCall(async (data, context) => {

        const { uid, token } = (context.auth || {});
        const { email, name } = (token || {});

        const subs = await getActiveSubscriptions({ account: uid, ...stripeIntegrationConfig });
        const entitlements = calculateEntitlements(subs, data?.includeTesting);

        return {
            email,
            uid,
            name,
            ...entitlements,
            free: entitlements.license === FREE
        };

    });

exports.setAdmin = functions.https.onCall(async (data, context) => {

    if (!await isAdmin(context.auth))
        return new functions.https.HttpsError("permission-denied", "Admin only");

    const user = await getAuth().getUserByEmail("tinycode2@gmail.com");
    await getAuth().setCustomUserClaims(user.uid, { admin: true });
    return "Ok";

});


