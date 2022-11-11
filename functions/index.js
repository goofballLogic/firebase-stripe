// config
const { defineSecret } = require('firebase-functions/params');
const stripeAPIKey = defineSecret("STRIPE_API_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// deps
const functions = require("firebase-functions");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const { processRequestAsStripeEventToCollection, aggregateSubscriptionEvents, ensureProduct } = require("./stripe-integration");

// firestore
const firestore = getFirestore(initializeApp());
const stripeEventsCollection = firestore.collection("stripe-events");
const stripeCustomerCollection = firestore.collection("stripe-customers");
const stripeSubscriptionsCollection = firestore.collection("stripe-subscriptions");
const stripeProductsCollection = firestore.collection("stripe-products");

// stripe integration
const stripeIntegrationConfig = {
    key: stripeAPIKey,
    secret: stripeWebhookSecret,
    events: stripeEventsCollection,
    customers: stripeCustomerCollection,
    subscriptions: stripeSubscriptionsCollection,
    products: stripeProductsCollection
};

exports.stripeWebhook = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onRequest(async (request, response) => {
        try {
            // process
            await processRequestAsStripeEventToCollection({ request, ...stripeIntegrationConfig });
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

exports.test = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onRequest(async (request, response) => {

        await aggregateSubscriptionEvents({
            account: "5GTbxnT86XTq29cnPIHzprDMCRw2",
            ...stripeIntegrationConfig
        });

        // await ensureProduct({
        //     product: "prod_MmBmwgPOAFmMxo",
        //     ...stripeIntegrationConfig
        // });
        response.send("test: ok");

    });
