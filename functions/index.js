// deps
const functions = require("firebase-functions");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getActiveSubscriptions, replayEvents, processStripeEvent } = require("./stripe-integration");
const { calculateEntitlements, FREE } = require("./product-entitlements");
const readThrough = require('./read-through');
const { defineSecret } = require('firebase-functions/params');
const { getAuth } = require("firebase-admin/auth");

// config
const stripeAPIKey = defineSecret("STRIPE_API_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// firestore
const firestore = getFirestore(initializeApp());

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

// incoming webhook
exports.stripeWebhook = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onRequest(async (request, response) => {
        try {
            // process
            await processStripeEvent({ request, ...stripeIntegrationConfig });
            // respond
            response.send("stripeWebhook: Ok");
        } catch (err) {
            // warn
            functions.logger.warn(err);
            // respond
            const code = err.type ? 400 : 500;
            response.status(code).send("stripeWebhook: Invalid request");
        }

    });

exports.replayEventDatabase = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onCall(async (_, context) => {

        const user = await getAuth().getUser(context.auth?.uid);
        if (!user.customClaims.admin)
            return new functions.https.HttpsError("permission-denied", "Admin only");
        const start = Date.now();
        await replayEvents({ ...stripeIntegrationConfig });
        return `Ok. ${Date.now() - start}ms.`;

    });

// fetch config for user
exports.fetchUserConfig = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onCall(async (data, context) => {

        const { uid, token } = (context.auth || {});
        const { email, name } = (token || {});

        const subs = await readThrough(
            "getActiveSubscriptions",
            () => getActiveSubscriptions({ account: uid, ...stripeIntegrationConfig })
        );

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

    const user = await getAuth().getUserByEmail("tinycode2@gmail.com");
    await getAuth().setCustomUserClaims(user.uid, {
        admin: true
    });
    console.log(await getAuth().getUserByEmail("tinycode2@gmail.com"));

});
