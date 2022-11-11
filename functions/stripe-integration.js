const stripe = require("stripe");

async function processRequestAsStripeEventToCollection({
    request,
    key,
    secret,
    events,
    customers,
    subscriptions
}) {
    // init
    const signature = request.headers["stripe-signature"];
    const { webhooks } = stripe(key.value());
    // verify and decode
    const rawBody = request.rawBody.toString();
    const stripeEvent = await webhooks.constructEventAsync(rawBody, signature, secret.value());
    // record
    const eventDocument = events.doc(stripeEvent.id);
    await eventDocument.set(stripeEvent);
    // record customer<->account lookup
    const { customer, client_reference_id, object: dataObject } = stripeEvent.data.object;
    if (customer && client_reference_id)
        await customers.doc(customer).set({
            event: eventDocument,
            customer,
            account: client_reference_id
        });
    // record subscription events
    if (dataObject === "subscription") {
        const ref = await customers.doc(customer).get();
        if (!ref.exists) {
            throw new Error(`Unknown customer for customer ${customer} in event ${stripeEvent.id}`);
        }
        const { account } = ref.data();
        if (!account) {
            throw new Error(`Unknown account for customer ${customer} in event ${stripeEvent.id}`);
        }
        await subscriptions.doc(account).set({
            events: {
                [stripeEvent.id]: stripeEvent
            }
        }, { merge: true });
        await aggregateSubscriptionEvents({ account, subscriptions });
    }

}

async function aggregateSubscriptionEvents({
    account,
    subscriptions
}) {

    const ref = await subscriptions.doc(account).get();
    if (!ref.exists)
        throw new Error(`Unknown account ${account}`);
    const { events } = ref.data();
    console.log(account);
    for (const e of Object.values(events))
        console.log(e.type, e.data?.object?.plan);
}

exports.processRequestAsStripeEventToCollection = processRequestAsStripeEventToCollection;
