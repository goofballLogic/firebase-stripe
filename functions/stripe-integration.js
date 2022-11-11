const stripe = require("stripe");

async function processRequestAsStripeEventToCollection({
    request,
    key,
    secret,
    collection
}) {
    // init
    const signature = request.headers["stripe-signature"];
    const { webhooks } = stripe(key.value());
    // verify and decode
    const rawBody = request.rawBody.toString();
    const stripeEvent = await webhooks.constructEventAsync(rawBody, signature, secret.value());
    // record
    await collection.doc(stripeEvent.id).set(stripeEvent);
}

exports.processRequestAsStripeEventToCollection = processRequestAsStripeEventToCollection;
