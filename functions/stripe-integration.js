const stripe = require("stripe");

const subscriptionEvents = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
const checkoutCompleteEvent = "checkout.session.completed";

const log = console.log.bind(console);

const SEC = 1000;
const MIN = SEC * 60;
const HOUR = MIN * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;

const age = x => Date.now() - x;

async function processStripeEvent({

    request,
    key,
    secret,
    events,
    customers,
    accounts,
    products,
    errors

}) {

    // verify the event
    const stripeEvent = await buildVerifiedEvent(request, key, secret);

    // record the event
    const eventDocument = events.doc(stripeEvent.id);
    await eventDocument.set(stripeEvent);

    // process it
    await processStripeEventData(stripeEvent, { customers, key, errors, accounts, products });

}

exports.replayEvents = async function ({ key, events, customers, errors, accounts, products }) {

    const snapshot = await events.get();
    const docs = snapshot.docs;
    for (const doc of docs) {

        // fetch event
        const stripeEvent = doc.data();
        log(`--- Processing event ${stripeEvent.id}: ${stripeEvent.type} ---`);

        // process it
        await processStripeEventData(stripeEvent, { key, accounts, customers, products, errors });

    }

};


async function processStripeEventData(stripeEvent, { customers, key, errors, accounts, products }) {

    try {

        // if given, map account to customer
        await recordCustomerAccountMappings(stripeEvent, { customers });

        // if subscription related - update the account subscription
        await recordAccountSubscriptionChange(stripeEvent, { customers, key, accounts, products });

    } catch (err) {

        await errors.doc(stripeEvent.id).set({
            event: stripeEvent,
            message: err.stack,
            when: Date.now()
        });
        console.error(err);

    }

}

async function ensureProductDetails(stripeEvent, { key, products }) {

    if (!subscriptionEvents.includes(stripeEvent.type)) return;

    const product = stripeEvent.data.object?.plan?.product;
    if (!product)
        throw new Error(`Product not found in stripe event ${stripeEvent.id} (.data.object.plan.product)`);

    const ref = products.doc(product);
    const snapshot = await ref.get();
    const snapshotData = snapshot.exists && snapshot.data();
    if (snapshotData && age(snapshotData.updated) < WEEK)
        return snapshotData;

    const client = stripe(key.value());
    const resp = await client.products.retrieve(product);
    const { description, livemode, name, metadata: { "product-code": code } } = resp;

    const updatedData = {
        updated: Date.now(),
        data: { description, livemode, name, code }
    };

    log(`Setting product ${product} because of event ${stripeEvent.id}`);
    await ref.set(updatedData);
    return updatedData;

}

async function recordAccountSubscriptionChange(stripeEvent, { key, customers, accounts, products }) {

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

            const productSnapshot = await ensureProductDetails(stripeEvent, { key, products });
            subscriptionData.product = productSnapshot.data;

            log(`Merging in subscription ${id} for account ${account}`);
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

async function recordCustomerAccountMappings(stripeEvent, { customers }) {

    if (stripeEvent.type !== checkoutCompleteEvent) return;
    const { customer, client_reference_id } = stripeEvent.data.object;
    if (customer && client_reference_id) {

        const customerRef = customers.doc(customer);
        const customerSnapshot = await customerRef.get();
        if (!customerSnapshot.exists) {

            log(`Recording map of customer ${customer} to account ${client_reference_id}`);
            await customerRef.set({ account: client_reference_id, event: stripeEvent.id });

        }

    }

}

async function buildVerifiedEvent(request, key, secret) {

    const signature = request.headers["stripe-signature"];
    const { webhooks } = stripe(key.value());
    // verify and decode
    const rawBody = request.rawBody.toString();
    return await webhooks.constructEventAsync(rawBody, signature, secret.value());

}

async function getActiveSubscriptions({ account, accounts }) {

    const ref = accounts.doc(account);
    const snapshot = await ref.get();
    if (snapshot.exists) {

        const data = snapshot.data();
        if ("subscriptions" in data)
            return Object.values(data.subscriptions).filter(sub => ["trialing", "active"].includes(sub.status));

    }
    return [];

}


async function ensureProduct({
    key,
    product,
    products
}) {

    const productRef = products.doc(product);
    let existing = productRef.get();
    const now = Date.now();
    const age = x => now - x;
    if (!existing.exists || age(existing.data().downloaded) > WEEK) {

        const client = stripe(key.value());
        const resp = await client.products.retrieve(product);
        await productRef.set({
            data: resp,
            downloaded: now
        });
        existing = await productRef.get();

    }

}

exports.processStripeEvent = processStripeEvent;
exports.ensureProduct = ensureProduct;
exports.getActiveSubscriptions = getActiveSubscriptions;
