import stripe from "stripe";

import { processStripeEventData } from "./process-stripe-event-data.js";

export async function processStripeEvent({

    request, key, secret, events, customers, accounts, products, errors, logger

}) {

    logger.log("Received stripe event", { id: request.body?.id, type: request.body?.type });

    // verify the event
    const signature = request.headers["stripe-signature"];
    const client = stripe(key.value());
    const rawBody = request.rawBody.toString();
    const stripeEvent = await client.webhooks.constructEventAsync(rawBody, signature, secret.value());

    // record the event
    await processVerifiedStripeEvent(stripeEvent, {

        events, logger, customers, key, errors, accounts, products

    });

}

export async function processVerifiedStripeEvent(stripeEvent, {

    events, logger, customers, key, errors, accounts, products

}) {

    const eventDocument = events.doc(stripeEvent.id);
    await eventDocument.set(stripeEvent);
    logger.debug("Recorded stripe event", { id: stripeEvent.id });

    // process it
    await processStripeEventData(stripeEvent, { customers, key, errors, accounts, products, logger });

}
