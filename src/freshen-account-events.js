import { processVerifiedStripeEvent } from "./process-stripe-event.js";

export async function freshenAccountEvents({

    account, events, logger, customers, key, errors, accounts, products

}) {

    logger.warn("Freshen account events requested for account", { account });

    const client = stripe(key.value());
    const eventList = [];
    let starting_after = undefined;
    let hasMore = false;
    do {

        logger.debug("Requesting stripe events.list", { starting_after });
        const response = await client.events.list({
            types: [...subscriptionEvents, checkoutCompleteEvent],
            limit: 100,
            starting_after
        });
        if (response.data) {

            eventList.push(...response.data);
            starting_after = response.data[response.data.length - 1].id;

        }
        hasMore = response.has_more;

    } while (hasMore);

    console.log(eventList[0]);
    eventList.sort((a, b) => a.created - b.created);
    console.log(eventList[0]);
    for (const evt of eventList) {

        await processVerifiedStripeEvent(evt, { events, logger, customers, key, errors, accounts, products });

    }
    logger.debug("Processing retrieved events complete");

}
