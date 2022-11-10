const functions = require("firebase-functions");

exports.stripeWebook = functions.https.onRequest((request, response) => {
    functions.logger.info("Stripe says", { body: request.rawBody });
    response.send("firestripe:ok");
});
