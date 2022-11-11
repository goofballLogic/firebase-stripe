// config
const { defineSecret } = require('firebase-functions/params');
const stripeAPIKey = defineSecret("STRIPE_API_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// deps
const functions = require("firebase-functions");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const { processRequestAsStripeEventToCollection } = require("./stripe-integration");

// firestore
const firestore = getFirestore(initializeApp());
const stripeEventsCollection = firestore.collection("stripe-events");

const stripeIntegrationConfig = {
    key: stripeAPIKey,
    secret: stripeWebhookSecret,
    collection: stripeEventsCollection
};

exports.stripeWebhook = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onRequest(async (request, response) => {
        try {
            // process
            await processRequestAsStripeEventToCollection({ request, ...stripeIntegrationConfig });
            // respond
            response.send("firestripe:ok");
        } catch (err) {
            // warn
            functions.logger.warn(err);
            // respond
            response.status(400).send("Invalid request");
        }

    });


