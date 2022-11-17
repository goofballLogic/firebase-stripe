import stripe from "stripe";

import { checkoutCompleteEvent, subscriptionEvents, WEEK } from "./taxonomy.js";

export async function processStripeEventData(
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
