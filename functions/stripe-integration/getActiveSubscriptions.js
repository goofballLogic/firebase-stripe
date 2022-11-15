const { activeSubscriptionStatuses } = require("./taxonomy");

module.exports = async function getActiveSubscriptions({

    account, accounts

}) {

    const ref = accounts.doc(account);
    const snapshot = await ref.get();
    if (snapshot.exists) {

        const data = snapshot.data();
        if ("subscriptions" in data)
            return Object.values(data.subscriptions).filter(sub => activeSubscriptionStatuses.includes(sub.status));

    }
    return [];

};
