const cache = {};

const SEC = 1000;

module.exports = async function readThrough(key, strategy, cacheFor = (10 * SEC)) {

    const now = Date.now();
    if (key in cache) {

        const { created, result } = cache[key];
        if ((created + cacheFor) > now)
            return result; // valid cache
        else
            delete cache[key]; // invalid cache

    }
    const result = await strategy();
    cache[key] = {
        created: now,
        result
    };
    return result;

};