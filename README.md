[![Deploy to Firebase Hosting on merge](https://github.com/goofballLogic/firebase-stripe/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/goofballLogic/firebase-stripe/actions/workflows/firebase-hosting-merge.yml)

# Integration
To add payment integration to your application:

### Install library
1. Install Stripe's node library (https://www.npmjs.com/package/stripe)
2. Download the single file functions code (`stripe-integration.js`) from the releases folder (https://github.com/goofballLogic/firebase-stripe/releases) and place it in your firebase functions directory.

### Configure the integration:
    
```js
// config
const stripeAPIKey = defineSecret("STRIPE_API_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// stripe integration
const stripeIntegrationConfig = {

    key: stripeAPIKey,
    secret: stripeWebhookSecret,
    events: firestore.collection("stripe-events"),
    customers: firestore.collection("stripe-customers"),
    products: firestore.collection("stripe-products"),
    errors: firestore.collection("stripe-event-errors"),
    accounts: firestore.collection("accounts"),
    logger: functions.logger

};

```

1. Define secrets in Firebase to hold your Stripe API key and webhook secret
2. Define the name of collections in Firestore which will be populated by the library:
    - events: a record of events received from Stripe
    - customers: a mapping of Stripe customer ids to your account ids
    - products: downloaded details of products in Stripe
    - errors: where to record errors which occur when processing events
    - accounts: where to record processed events and current subscriptions
    - logger: firebase's logger

### Create a publicly accessible https function

```js
// incoming webhook
exports.stripeWebhook = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onRequest(async (request, response) => {
        try {
            // process
            await processStripeEvent({ request, ...stripeIntegrationConfig });
            // respond
            response.send("stripeWebhook: Ok");
        } catch (err) {
            // warn
            functions.logger.warn(err);
            // respond
            const code = err.type ? 400 : 500;
            response.status(code).send("stripeWebhook: Invalid request");
        }

    });
```

### (Optional) Create a function to fetch the active subscriptions

```js
exports.fetchUserSubscriptions = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onCall(async (_, context) => {

        const account = context.auth.uid;
        return await getActiveSubscriptions({ account, ...stripeIntegrationConfig });
        
    });
```

### (Optional) Create a utility function to replay events

```js

exports.replayEventDatabase = functions
    .runWith({ secrets: [stripeAPIKey, stripeWebhookSecret] })
    .https.onCall(async (_, context) => {

        await replayEvents({ ...stripeIntegrationConfig });
        return "Ok";

    });
```

## Process flow    

```mermaid
sequenceDiagram
    
    participant App
    participant Account
    participant Stripe
    Account->>App: I want to buy
    App->>Account: Go to check-out (with ref id)
    Account->>Stripe: Check-out
    Stripe-->>Account: OK
    Stripe->>App: Check-out complete (with ref id, customer)
    App->>App: Account is Customer
    Stripe-->>App: Subscription created/updated (with customer, product)
    App->>App: Subscription is Account
    App->>App: Account has Subscription id
    App->>App: Update account subscriptions
    loop Every current subscription
        App->>Stripe: Fetch subscription
        Stripe-->>App: Sub
    end

```
