'use strict';

var stripe = require('stripe');

const checkoutCompleteEvent = "checkout.session.completed";

const subscriptionEvents = Object.freeze([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted"
]);

const activeSubscriptionStatuses = Object.freeze([
    "trialing",
    "active"
]);

const WEEK = 1000 * 60 * 60 * 24 * 7;

async function processStripeEventData(
    stripeEvent,
    { customers, key, errors, accounts, products, logger }
) {

    try {

        logger.debug("Processing stripe event", { id: stripeEvent.id, type: stripeEvent.type });

        // if given, map account to customer
        await recordCustomerAccountMappings(stripeEvent, { customers, logger });

        // if subscription related - update the account subscription
        await recordAccountSubscriptionChange(stripeEvent, { customers, key, accounts, products, logger });

    } catch (err) {

        await errors.doc(stripeEvent.id).set({
            event: stripeEvent,
            message: err.stack,
            when: Date.now()
        });
        logger.error(err);

    }

}

async function recordAccountSubscriptionChange(stripeEvent, { key, customers, accounts, products, logger }) {

    if (!stripeEvent.type.includes("subscription")) return;

    const customer = stripeEvent.data.object.customer;
    const account = (await customers.doc(customer).get()).data()?.account;
    if (!account) throw new Error(`Account not found for customer ${customer}`);

    if (subscriptionEvents.includes(stripeEvent.type)) {

        const ref = accounts.doc(account);
        const snapshot = await ref.get();
        const data = snapshot.exists ? snapshot.data() : {};
        const subscriptions = data.subscriptions || {};
        const { id, status, livemode, quantity } = stripeEvent.data.object;
        const subscriptionData = subscriptions[id] || {};

        if (!subscriptionData.eventDate || (subscriptionData.eventDate < stripeEvent.created)) {

            subscriptionData.eventDate = stripeEvent.created;
            subscriptionData.status = status;
            subscriptionData.quantity = quantity;
            subscriptionData.livemode = livemode;

            const productSnapshot = await ensureProductDetails(stripeEvent, { key, products, logger });
            subscriptionData.product = productSnapshot.data;

            logger.log("Merging in subscription", { id, account });
            await ref.set({
                subscriptions: {
                    [id]: subscriptionData
                }
            }, {
                merge: true
            });

        }

    } else {

        throw new Error(`Unknown subscription event type: ${stripeEvent.type} for event ${stripeEvent.id}`);

    }

}


async function recordCustomerAccountMappings(stripeEvent, { customers, logger }) {

    if (stripeEvent.type !== checkoutCompleteEvent) return;
    const { customer, client_reference_id } = stripeEvent.data.object;
    if (customer && client_reference_id) {

        const customerRef = customers.doc(customer);
        const customerSnapshot = await customerRef.get();
        if (!customerSnapshot.exists) {

            logger.log("Recording map of customer to account", { customer, account: client_reference_id });
            await customerRef.set({ account: client_reference_id, event: stripeEvent.id });

        }

    }

}

async function ensureProductDetails(stripeEvent, { key, products, productStaleness = WEEK, logger }) {

    if (!subscriptionEvents.includes(stripeEvent.type)) return;

    const product = stripeEvent.data.object?.plan?.product;
    if (!product)
        throw new Error(`Product not found in stripe event ${stripeEvent.id} (.data.object.plan.product)`);

    const ref = products.doc(product);
    const snapshot = await ref.get();
    const snapshotData = snapshot.exists && snapshot.data();
    if (snapshotData && ((Date.now() - snapshotData.updated) < productStaleness))
        return snapshotData;

    const client = stripe(key.value());
    const resp = await client.products.retrieve(product);
    const { description, livemode, name, metadata: { "product-code": code } } = resp;

    const updatedData = {
        updated: Date.now(),
        data: { description, livemode, name, code }
    };

    logger.log("Setting product because of event", { event: stripeEvent.id, product });
    await ref.set(updatedData);
    return updatedData;

}

async function processStripeEvent({

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

}
async function buildVerifiedEvent(request, { key, secret }) {

    const signature = request.headers["stripe-signature"];
    const { webhooks } = stripe(key.value());
    // verify and decode
    const rawBody = request.rawBody.toString();
    return await webhooks.constructEventAsync(rawBody, signature, secret.value());

}

async function replayEvents({

    key, events, customers, errors, accounts, products, logger

}) {

    const snapshot = await events.get();
    const docs = snapshot.docs;
    for (const doc of docs) {

        // fetch event
        const stripeEvent = doc.data();
        logger.log("--- Replaying event ---", { id: stripeEvent.id, type: stripeEvent.type });

        // process it
        await processStripeEventData(stripeEvent, { key, accounts, customers, products, errors, logger });

    }

}

async function getActiveSubscriptions({

    account, accounts, logger

}) {

    const ref = accounts.doc(account);
    const snapshot = await ref.get();
    if (snapshot.exists) {

        const data = snapshot.data();
        if ("subscriptions" in data)
            return Object.values(data.subscriptions).filter(sub => activeSubscriptionStatuses.includes(sub.status));

    }
    logger.warn("Account or subscriptions not found", { account });
    return [];

}

exports.getActiveSubscriptions = getActiveSubscriptions;
exports.processStripeEvent = processStripeEvent;
exports.replayEvents = replayEvents;
