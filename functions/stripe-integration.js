const stripe = require("stripe");

async function processRequestAsStripeEventToCollection({
    request,
    key,
    secret,
    events,
    customers,
    subscriptions,
    products
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
    key,
    account,
    subscriptions,
    products
}) {

    const accountSubscription = subscriptions.doc(account);
    const ref = await accountSubscription.get();
    if (!ref.exists)
        throw new Error(`Unknown account ${account}`);
    const { events } = ref.data();
    const objectEvents = Object.values(events)
        .filter(e => e.data?.object?.plan?.product)
        .map(({
            created,
            data: {
                object: {
                    id,
                    status,
                    livemode,
                    quantity,
                    plan: {
                        product
                    }
                }
            }
        }) => ({

            id,
            created,
            status,
            livemode,
            quantity,
            product

        }))
        .reduce((index, record) => {

            const { id } = record;
            index[id] = index[id] || record;
            if (record.created > index[id].created) index[id] = record;
            return index;

        }, {});

    const current = Object.values(objectEvents);
    await accountSubscription.set({ current }, { merge: true });

    for (const x of current) {
        await ensureProduct({ key, product: x.product, products });
    }

}

async function ensureProduct({
    key,
    product,
    products
}) {

    const client = stripe(key.value());
    const resp = await client.products.retrieve(product);
    await products.doc(product).set(resp);

}

exports.processRequestAsStripeEventToCollection = processRequestAsStripeEventToCollection;
exports.aggregateSubscriptionEvents = aggregateSubscriptionEvents;
exports.ensureProduct = ensureProduct;
