
export const checkoutCompleteEvent = "checkout.session.completed";

export const subscriptionEvents = Object.freeze([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted"
]);

export const activeSubscriptionStatuses = Object.freeze([
    "trialing",
    "active"
]);

export const WEEK = 1000 * 60 * 60 * 24 * 7;