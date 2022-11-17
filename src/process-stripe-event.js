import stripe from "stripe";

import { processStripeEventData } from "./process-stripe-event-data.js";

export async function processStripeEvent({

    request, key, secret, events, customers, accounts, products, errors, logger

}) {

    logger.log("Received stripe event", { id: request.body?.id, type: request.body?.type });

    // verify the event
    const stripeEvent = await buildVerifiedEvent(request, { key, secret });

    // record the event
    const eventDocument = events.doc(stripeEvent.id);
    await eventDocument.set(stripeEvent);
    logger.debug("Recorded stripe event", { id: stripeEvent.id });

    // process it
    await processStripeEventData(stripeEvent, { customers, key, errors, accounts, products, logger });

};

async function buildVerifiedEvent(request, { key, secret }) {

    const signature = request.headers["stripe-signature"];
    const { webhooks } = stripe(key.value());
    // verify and decode
    const rawBody = request.rawBody.toString();
    return await webhooks.constructEventAsync(rawBody, signature, secret.value());

}