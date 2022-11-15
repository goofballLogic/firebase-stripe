const { processStripeEventData } = require("./processStripeEventData");

module.exports = async function replayEvents({

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

};
