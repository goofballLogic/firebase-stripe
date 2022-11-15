const STANDARD = "standard";
const PRO = "pro";
const ENTERPRISE = "enterprise";
const FREE = "free";

function calculateEntitlements(subscriptions, includeTesting) {

    const sub = reduceSubscriptions(subscriptions, includeTesting);
    return calculateEntitlementsForSubscription(sub);

}

function calculateEntitlementsForSubscription(subscription) {

    switch (subscription?.product?.code) {
        case STANDARD:
            return { seats: 1, team: false, widgets: 5, license: STANDARD, licenseName: subscription.product.name };
        case PRO:
            return { seats: 5, team: false, widgets: 20, license: PRO, licenseName: subscription.product.name };
        case ENTERPRISE:
            return { seats: subscription.quantity, teams: true, widgets: 250, license: ENTERPRISE, licenseName: subscription.product.name };
        default:
            return { seats: 1, team: false, widgets: 3, license: FREE };
    }

}
function reduceSubscriptions(subscriptions, includeTesting) {

    const includedSubscriptions = subscriptions.filter(s => includeTesting || (s.livemode && s.product.livemode));
    let found;
    for (const sub of includedSubscriptions) {

        if (sub.product.code === ENTERPRISE) {
            return sub;
        }
        if (found) {
            if (found.product.code === STANDARD && sub.product.code === PRO)
                found = sub;
        } else {
            found = sub;
        }

    }
    return found;

}

module.exports = {
    calculateEntitlements,
    FREE
};