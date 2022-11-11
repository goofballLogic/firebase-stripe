// config
const { defineSecret } = require('firebase-functions/params');
const stripeAPIKey = defineSecret("STRIPE_API_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// deps
const functions = require("firebase-functions");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const stripe = require("stripe");

// firestore
const db = getFirestore(initializeApp());

exports.stripeWebhook = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onRequest(async (request, response) => {

        const signature = request.headers["stripe-signature"];
        const stripeClient = stripe(stripeAPIKey.value());
        try {
            // verify
            const rawBody = request.rawBody.toString();
            const stripeEvent = await stripeClient.webhooks.constructEventAsync(rawBody, signature, stripeWebhookSecret.value());
            // record
            await db.collection("stripe-events").doc(stripeEvent.id).set(stripeEvent);
            // respond
            response.send("firestripe:ok");
        } catch (err) {
            // warn
            functions.logger.warn(err);
            // respond
            response.status(400).send("Invalid request");
        }

    });
